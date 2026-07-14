import { Injectable } from '@nestjs/common';
import { DocumentType, ExpenseStatus, PaymentType, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAnalyticsQueryDto } from './dto/financial-analytics.dto';
import { resolveFinancialPeriod } from './financial-period';

const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const n = (value: Prisma.Decimal.Value = 0) => D(value).toDecimalPlaces(3).toNumber();
const rate = (part: Prisma.Decimal, base: Prisma.Decimal) => base.gt(0) ? n(part.div(base).mul(100)) : 0;

@Injectable()
export class FinancialAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private saleWhere(range: { gte: Date; lte: Date }): Prisma.SaleWhereInput {
    return { createdAt: range, deletedAt: null, status: { in: [SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED, SaleStatus.RETURNED] },
      OR: [{ documentType: DocumentType.FACTURE }, { documentType: DocumentType.BON_LIVRAISON, transformedToId: null }] };
  }

  async getDashboardMetrics(query: FinancialAnalyticsQueryDto) {
    const ranges = resolveFinancialPeriod(query.period, query.dateFrom, query.dateTo);
    const [current, previous, cash] = await Promise.all([
      this.compute(ranges.current, true), this.compute(ranges.previous, false), this.getCashBalances(),
    ]);
    const comparable = ['salesCount', 'netRevenueHT', 'grossMarginHT', 'netProfit', 'customerPayments', 'cogsHT', 'discountsHT', 'creditNotesHT'] as const;
    const comparisons = Object.fromEntries(comparable.map((key) => {
      const a = Number(current.summary[key]); const b = Number(previous.summary[key]);
      return [key, { absolute: n(D(a).minus(b)), percent: b === 0 ? null : n(D(a).minus(b).div(Math.abs(b)).mul(100)) }];
    }));
    return { period: query.period ?? 'month', range: ranges.current, summary: current.summary, comparisons, cash, dataQuality: current.dataQuality };
  }

  async getFinancialSummary(query: FinancialAnalyticsQueryDto) {
    const range = resolveFinancialPeriod(query.period, query.dateFrom, query.dateTo).current;
    return this.compute(range, true);
  }

  async getProfitBySale(query: FinancialAnalyticsQueryDto) { return (await this.getFinancialSummary(query)).sales; }
  async getProfitByProduct(query: FinancialAnalyticsQueryDto) { return (await this.getFinancialSummary(query)).products; }
  async getProfitByCustomer(query: FinancialAnalyticsQueryDto) { return (await this.getFinancialSummary(query)).customers; }
  async getProfitTimeline(query: FinancialAnalyticsQueryDto) { return (await this.getFinancialSummary(query)).timeline; }

  private async compute(range: { gte: Date; lte: Date }, details: boolean) {
    const where = this.saleWhere(range);
    const [sales, creditNotes, expenses, payments, customerOutstanding, supplierOutstanding] = await Promise.all([
      this.prisma.sale.findMany({ where, include: { customer: true, items: { include: { product: { include: { category: true, brand: true } } } } } }),
      this.prisma.creditNote.findMany({ where: { dateAvoir: range, statut: { not: 'CANCELLED' } }, include: { items: { include: { saleItem: true } } } }),
      this.prisma.expense.aggregate({ where: { expenseDate: range, status: ExpenseStatus.ACTIVE, purchaseId: null }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { createdAt: range, deletedAt: null, type: PaymentType.CUSTOMER_PAYMENT }, _sum: { amount: true } }),
      this.prisma.sale.aggregate({ where: { deletedAt: null, status: { not: SaleStatus.CANCELLED }, documentType: DocumentType.FACTURE }, _sum: { remainingAmount: true } }),
      this.prisma.purchase.aggregate({ where: { deletedAt: null, status: { not: 'CANCELLED' } }, _sum: { remainingAmount: true } }),
    ]);
    let grossRevenue = D(0), revenue = D(0), discounts = D(0), vat = D(0), stamps = D(0), cogs = D(0), quantity = 0;
    const warnings: string[] = []; const productMap = new Map<string, any>(); const customerMap = new Map<string, any>();
    const saleRows = sales.map((sale) => {
      let saleCogs = D(0), qty = 0;
      if (sale.items.length === 0) warnings.push(`Vente validée sans ligne: ${sale.invoiceNumber}`);
      if (D(sale.paidAmount).gt(D(sale.total).plus(sale.stampDuty))) warnings.push(`Encaissement supérieur au total: ${sale.invoiceNumber}`);
      for (const item of sale.items) {
        if (item.quantity < 0) warnings.push(`Quantité négative inattendue: ${sale.invoiceNumber}/${item.designation ?? item.product.name}`);
        const gross = D(item.unitPrice).mul(item.quantity); const net = D(item.total); const cost = item.unitPurchaseCostHTSnapshot;
        grossRevenue = grossRevenue.plus(gross); revenue = revenue.plus(net); discounts = discounts.plus(gross.minus(net)); qty += item.quantity; quantity += item.quantity;
        if (cost == null) warnings.push(`Coût historique manquant: ${sale.invoiceNumber}/${item.designation ?? item.product.name}`);
        const lineCogs = cost == null ? D(0) : D(cost).mul(item.quantity); saleCogs = saleCogs.plus(lineCogs); cogs = cogs.plus(lineCogs);
        if (item.purchaseCostEstimated) warnings.push(`Coût estimé: ${sale.invoiceNumber}/${item.designation ?? item.product.name}`);
        const margin = net.minus(lineCogs); if (cost != null && margin.lt(0)) warnings.push(`Vente à perte: ${sale.invoiceNumber}/${item.designation ?? item.product.name}`);
        const p = productMap.get(item.productId) ?? { productId: item.productId, reference: item.product.reference, name: item.product.name,
          category: item.product.category?.name ?? '—', brand: item.product.brand?.name ?? '—', quantitySold: 0, revenueHT: D(0), cogsHT: D(0), marginHT: D(0), discountHT: D(0), sales: new Set(), stock: item.product.quantity, costUnknown: false };
        p.quantitySold += item.quantity; p.revenueHT = p.revenueHT.plus(net); p.cogsHT = p.cogsHT.plus(lineCogs); p.marginHT = p.marginHT.plus(margin); p.discountHT = p.discountHT.plus(gross.minus(net)); p.sales.add(sale.id); p.costUnknown ||= cost == null; productMap.set(item.productId, p);
      }
      const margin = D(sale.subtotal).minus(saleCogs);
      const row = { id: sale.id, date: sale.createdAt, reference: sale.invoiceNumber, client: sale.customer?.name ?? sale.counterClientFullName ?? 'Comptoir',
        articles: qty, revenueHT: n(sale.subtotal), cogsHT: n(saleCogs), marginHT: n(margin), marginRate: rate(margin, saleCogs), netProfit: n(margin),
        operatingExpenses: 0, paymentStatus: sale.paymentStatus, collected: n(sale.paidAmount), outstanding: n(sale.remainingAmount) };
      const key = sale.customerId ?? `counter:${row.client}`; const c = customerMap.get(key) ?? { client: row.client, salesCount: 0, revenueHT: D(0), marginHT: D(0), collected: D(0), outstanding: D(0), lastSale: sale.createdAt };
      c.salesCount++; c.revenueHT = c.revenueHT.plus(sale.subtotal); c.marginHT = c.marginHT.plus(margin); c.collected = c.collected.plus(sale.paidAmount); c.outstanding = c.outstanding.plus(sale.remainingAmount); if (sale.createdAt > c.lastSale) c.lastSale = sale.createdAt; customerMap.set(key, c);
      vat = vat.plus(sale.tax); stamps = stamps.plus(sale.stampDuty); return row;
    });
    const creditNotesHT = creditNotes.reduce((s, cn) => s.plus(cn.subtotal), D(0));
    const creditsBySale = new Map<string, Prisma.Decimal>(); const returnedCostBySale = new Map<string, Prisma.Decimal>();
    let returnedCogs = D(0);
    for (const cn of creditNotes) {
      creditsBySale.set(cn.saleId, (creditsBySale.get(cn.saleId) ?? D(0)).plus(cn.subtotal));
      for (const item of cn.items) {
        const p = productMap.get(item.productId); if (p) p.revenueHT = p.revenueHT.minus(item.totalHt);
        if (item.stockRestocked && item.saleItem?.unitPurchaseCostHTSnapshot) {
          const returned = D(item.saleItem.unitPurchaseCostHTSnapshot).mul(item.quantiteRetournee); returnedCogs = returnedCogs.plus(returned);
          returnedCostBySale.set(cn.saleId, (returnedCostBySale.get(cn.saleId) ?? D(0)).plus(returned));
          if (p) p.cogsHT = p.cogsHT.minus(returned);
        }
        if (p) p.marginHT = p.revenueHT.minus(p.cogsHT);
      }
    }
    const adjustedCogs = cogs.minus(returnedCogs); const netRevenue = revenue.minus(creditNotesHT); const margin = netRevenue.minus(adjustedCogs); const operatingExpenses = D(expenses._sum.amount ?? 0); const netProfit = margin.minus(operatingExpenses);
    for (const row of saleRows) {
      const credit = creditsBySale.get(row.id) ?? D(0); const returned = returnedCostBySale.get(row.id) ?? D(0);
      row.revenueHT = n(D(row.revenueHT).minus(credit)); row.cogsHT = n(D(row.cogsHT).minus(returned)); row.marginHT = n(D(row.revenueHT).minus(row.cogsHT)); row.marginRate = rate(D(row.marginHT), D(row.cogsHT));
      const expenseShare = netRevenue.gt(0) ? operatingExpenses.mul(row.revenueHT).div(netRevenue) : D(0);
      row.operatingExpenses = n(expenseShare); row.netProfit = n(D(row.marginHT).minus(expenseShare));
    }
    const summary = { salesCount: sales.length, quantitySold: quantity, grossRevenueHT: n(grossRevenue), discountsHT: n(discounts), creditNotesHT: n(creditNotesHT), netRevenueHT: n(netRevenue),
      vatCollected: n(vat), fiscalStampCollected: n(stamps), revenueTTC: n(revenue.plus(vat)), cogsHT: n(adjustedCogs), returnedCogsHT: n(returnedCogs), grossMarginHT: n(margin),
      operatingExpenses: n(operatingExpenses), netProfit: n(netProfit), grossMarginRate: rate(margin, adjustedCogs), markupOnRevenue: rate(margin, netRevenue),
      averageOrderValueHT: sales.length ? n(netRevenue.div(sales.length)) : 0, averageProfitPerSale: sales.length ? n(netProfit.div(sales.length)) : 0,
      customerPayments: n(payments._sum.amount ?? 0), customerOutstanding: n(customerOutstanding._sum.remainingAmount ?? 0), supplierOutstanding: n(supplierOutstanding._sum.remainingAmount ?? 0) };
    const products = [...productMap.values()].map((p) => ({ ...p, revenueHT: n(p.revenueHT), cogsHT: n(p.cogsHT), marginHT: n(p.marginHT), unitMargin: p.quantitySold ? n(p.marginHT.div(p.quantitySold)) : 0,
      marginRate: rate(p.marginHT, p.cogsHT), averageSalePrice: p.quantitySold ? n(p.revenueHT.div(p.quantitySold)) : 0, averageDiscount: p.sales.size ? n(p.discountHT.div(p.sales.size)) : 0, salesCount: p.sales.size,
      profitability: p.costUnknown ? 'COST_UNKNOWN' : p.marginHT.lt(0) ? 'LOSS' : rate(p.marginHT, p.cogsHT) < 20 ? 'LOW_MARGIN' : rate(p.marginHT, p.cogsHT) >= 40 ? 'VERY_PROFITABLE' : 'PROFITABLE', sales: undefined, discountHT: undefined }));
    const customers = [...customerMap.values()].map((c) => ({ ...c, revenueHT: n(c.revenueHT), marginHT: n(c.marginHT), netProfit: n(c.marginHT), collected: n(c.collected), outstanding: n(c.outstanding), averageOrder: c.salesCount ? n(c.revenueHT.div(c.salesCount)) : 0 }));
    const timelineMap = new Map<string, any>(); for (const row of saleRows) { const key = row.date.toISOString().slice(0, 10); const t = timelineMap.get(key) ?? { date: key, revenueHT: 0, cogsHT: 0, marginHT: 0, netProfit: 0, quantity: 0 }; t.revenueHT += row.revenueHT; t.cogsHT += row.cogsHT; t.marginHT += row.marginHT; t.netProfit += row.netProfit; t.quantity += row.articles; timelineMap.set(key, t); }
    return { summary, sales: details ? saleRows : [], products: details ? products : [], customers: details ? customers : [], timeline: details ? [...timelineMap.values()] : [], dataQuality: { hasWarnings: warnings.length > 0, warnings: [...new Set(warnings)], estimatedCostLines: warnings.filter((w) => w.startsWith('Coût estimé')).length } };
  }

  private async getCashBalances() { const config = await this.prisma.caisseConfig.findFirst(); return { physicalCash: n(config?.solde ?? 0), bankAndChecks: n(config?.soldeBanque ?? 0), global: n(D(config?.solde ?? 0).plus(config?.soldeBanque ?? 0)) }; }
}
