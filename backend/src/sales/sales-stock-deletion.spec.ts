import {
  DocumentType,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { SalesService } from './sales.service';

describe('SalesService.remove stock restitution', () => {
  const user = {
    id: 'user-1',
    email: 'nassim@example.test',
    role: 'ADMIN',
    permissions: ['sales.delete'],
  };

  function buildHarness(options?: {
    saleId?: string;
    documentType?: DocumentType;
    status?: SaleStatus;
    stockImpactDone?: boolean;
    items?: Array<{ id: string; productId: string; quantity: number }>;
    stocks?: Record<string, number>;
    movements?: Array<{
      productId: string;
      type: StockMovementType;
      previousQuantity: number;
      newQuantity: number;
      originalSaleId?: string;
      sourceType?: string;
      sourceId?: string;
      reason?: string;
    }>;
  }) {
    const saleId = options?.saleId ?? 'bl-1';
    const stocks = { ...(options?.stocks ?? { battery: 0 }) };
    const movements = [...(options?.movements ?? [])];
    const sale: any = {
      id: saleId,
      invoiceNumber: saleId === 'invoice-1' ? 'FAC-001' : 'BL-001',
      documentType: options?.documentType ?? DocumentType.BON_LIVRAISON,
      status: options?.status ?? SaleStatus.COMPLETED,
      stockImpactDone: options?.stockImpactDone ?? true,
      total: 100,
      customerId: 'customer-1',
      deletedAt: null,
      deletedBy: null,
      items: options?.items ?? [
        { id: 'bl-item-1', productId: 'battery', quantity: 1 },
      ],
    };

    const matchesMovementQuery = (movement: any, where: any) => {
      if (!where.type.in.includes(movement.type)) return false;
      return where.OR.some((condition: any) => {
        if (condition.originalSaleId)
          return movement.originalSaleId === condition.originalSaleId;
        if (condition.sourceId?.in)
          return (
            movement.sourceType === condition.sourceType &&
            condition.sourceId.in.includes(movement.sourceId)
          );
        if (condition.reason?.contains)
          return movement.reason?.includes(condition.reason.contains);
        return false;
      });
    };

    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sale: {
        findFirstOrThrow: jest.fn().mockImplementation(() => {
          if (sale.deletedAt) throw new Error('Sale not found');
          return { ...sale, items: sale.items.map((item: any) => ({ ...item })) };
        }),
        update: jest.fn().mockImplementation(({ data }: any) => {
          Object.assign(sale, data);
          return { ...sale };
        }),
      },
      stockMovement: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          movements.filter((movement) => matchesMovementQuery(movement, where)),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const stockService = {
      applyMovement: jest.fn().mockImplementation((_tx: any, input: any) => {
        const previousQuantity = stocks[input.productId];
        const delta =
          input.type === StockMovementType.SALE
            ? -input.quantity
            : input.quantity;
        stocks[input.productId] = previousQuantity + delta;
        const movement = {
          ...input,
          previousQuantity,
          newQuantity: stocks[input.productId],
        };
        movements.push(movement);
        return movement;
      }),
    };
    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesService(
      prisma as any,
      stockService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogs as any,
    );

    return { service, prisma, tx, sale, stocks, movements, stockService };
  }

  it('follows BATTERIE L1 stock 1 -> 0 -> 1, then allows a new BL to return it to 0', async () => {
    const harness = buildHarness({
      stocks: { battery: 0 },
      movements: [
        {
          productId: 'battery',
          type: StockMovementType.SALE,
          previousQuantity: 1,
          newQuantity: 0,
          sourceType: 'SALE_ITEM',
          sourceId: 'bl-item-1',
          reason: 'BON_LIVRAISON:BL-001',
        },
      ],
    });

    expect(harness.stocks.battery).toBe(0);
    await harness.service.remove('bl-1', user);
    expect(harness.stocks.battery).toBe(1);

    await harness.stockService.applyMovement(harness.tx, {
      productId: 'battery',
      type: StockMovementType.SALE,
      quantity: 1,
      reason: 'BON_LIVRAISON:BL-002',
    });
    expect(harness.stocks.battery).toBe(0);
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not restore the same deleted BL twice', async () => {
    const harness = buildHarness({
      movements: [
        {
          productId: 'battery',
          type: StockMovementType.SALE,
          previousQuantity: 1,
          newQuantity: 0,
          originalSaleId: 'bl-1',
        },
      ],
    });

    await harness.service.remove('bl-1', user);
    await expect(harness.service.remove('bl-1', user)).rejects.toThrow(
      'Sale not found',
    );
    expect(harness.stocks.battery).toBe(1);
  });

  it('restores the net quantity of every product in the BL', async () => {
    const harness = buildHarness({
      stocks: { productA: 3, productB: 2 },
      items: [
        { id: 'item-a', productId: 'productA', quantity: 2 },
        { id: 'item-b', productId: 'productB', quantity: 1 },
      ],
      movements: [
        {
          productId: 'productA',
          type: StockMovementType.SALE,
          previousQuantity: 5,
          newQuantity: 3,
          originalSaleId: 'bl-1',
        },
        {
          productId: 'productB',
          type: StockMovementType.SALE,
          previousQuantity: 3,
          newQuantity: 2,
          originalSaleId: 'bl-1',
        },
      ],
    });

    await harness.service.remove('bl-1', user);
    expect(harness.stocks).toEqual({ productA: 5, productB: 3 });
  });

  it('does not restore stock when deleting an invoice generated from the responsible BL', async () => {
    const harness = buildHarness({
      saleId: 'invoice-1',
      documentType: DocumentType.FACTURE,
      items: [{ id: 'invoice-item-1', productId: 'battery', quantity: 1 }],
      movements: [
        {
          productId: 'battery',
          type: StockMovementType.SALE,
          previousQuantity: 1,
          newQuantity: 0,
          originalSaleId: 'bl-1',
          sourceType: 'SALE_ITEM',
          sourceId: 'bl-item-1',
          reason: 'BON_LIVRAISON:BL-001',
        },
      ],
    });

    await harness.service.remove('invoice-1', user);
    expect(harness.stocks.battery).toBe(0);
    expect(harness.stockService.applyMovement).not.toHaveBeenCalled();
  });

  it('restores a validated invoice when that invoice created the stock exit', async () => {
    const harness = buildHarness({
      saleId: 'invoice-1',
      documentType: DocumentType.FACTURE,
      items: [{ id: 'invoice-item-1', productId: 'battery', quantity: 1 }],
      movements: [
        {
          productId: 'battery',
          type: StockMovementType.SALE,
          previousQuantity: 1,
          newQuantity: 0,
          sourceType: 'SALE_ITEM',
          sourceId: 'invoice-item-1',
          reason: 'FACTURE:FAC-001',
        },
      ],
    });

    await harness.service.remove('invoice-1', user);
    expect(harness.stocks.battery).toBe(1);
  });

  it.each([DocumentType.DEVIS, DocumentType.BON_COMMANDE])(
    'does not touch stock when deleting a %s',
    async (documentType) => {
      const harness = buildHarness({
        documentType,
        status: SaleStatus.DRAFT,
        stockImpactDone: false,
        stocks: { battery: 1 },
      });
      await harness.service.remove('bl-1', user);
      expect(harness.stocks.battery).toBe(1);
      expect(harness.tx.stockMovement.findMany).not.toHaveBeenCalled();
    },
  );
});
