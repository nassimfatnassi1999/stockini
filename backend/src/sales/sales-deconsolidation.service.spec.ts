import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConsolidationStatus, DocumentType, PaymentStatus, Prisma, SaleStatus } from '@prisma/client';
import { SalesService } from './sales.service';

const allowedUser = { id: 'user-1', email: 'user@test.tn', role: 'SELLER', permissions: ['sales.consolidation.cancel'] } as any;

function source(id: string, paid = 0, credit = 0) {
  return {
    id,
    invoiceNumber: `BL-${id}`,
    documentType: DocumentType.BON_LIVRAISON,
    total: new Prisma.Decimal(119),
    stampDuty: new Prisma.Decimal(1),
    payments: paid ? [{ amount: new Prisma.Decimal(paid) }] : [],
    creditNotes: credit ? [{ montantRembourse: new Prisma.Decimal(credit) }] : [],
  };
}

function build(options: { payments?: unknown[]; credits?: unknown[]; documents?: Array<{ status: string }> } = {}) {
  const links = [source('1', 50), source('2', 0, 10)].map((sale, index) => ({
    sourceSaleId: sale.id,
    sourceReference: sale.invoiceNumber,
    displayOrder: index,
    sourceSale: sale,
  }));
  const parent = {
    id: 'parent-1',
    invoiceNumber: 'BLG-CLIENT-18072026-001',
    total: new Prisma.Decimal(238),
    stampDuty: new Prisma.Decimal(2),
    paidAmount: new Prisma.Decimal(50),
    remainingAmount: new Prisma.Decimal(180),
    payments: options.payments ?? [],
    creditNotes: options.credits ?? [],
    generatedDocuments: options.documents ?? [],
    consolidationSources: links,
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    sale: {
      findFirstOrThrow: jest.fn().mockResolvedValue(parent),
      update: jest.fn(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    },
    saleConsolidationSource: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const audit = { audit: jest.fn().mockResolvedValue(undefined) };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  const service = new SalesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, audit as any);
  return { service, tx, audit };
}

describe('SalesService.cancelConsolidation', () => {
  it('restaure toutes les sources et désactive leurs relations actives', async () => {
    const { service, tx, audit } = build();
    const result = await service.cancelConsolidation('parent-1', 'Erreur de regroupement', allowedUser);
    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '1' },
      data: expect.objectContaining({ paidAmount: new Prisma.Decimal(50), remainingAmount: new Prisma.Decimal(70), paymentStatus: PaymentStatus.PARTIAL }),
    }));
    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '2' },
      data: expect.objectContaining({ totalRefunded: new Prisma.Decimal(10), remainingAmount: new Prisma.Decimal(110), paymentStatus: PaymentStatus.UNPAID }),
    }));
    expect(tx.saleConsolidationSource.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false }) }));
    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'parent-1' }, data: expect.objectContaining({ status: SaleStatus.CANCELLED, consolidationStatus: ConsolidationStatus.CANCELLED }) }));
    expect(result.restoredSourceIds).toEqual(['1', '2']);
    expect(audit.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'SALE_CONSOLIDATION_CANCELLED' }), tx);
  });

  it('bloque un paiement actif sur le parent avant toute restauration', async () => {
    const { service, tx } = build({ payments: [{ id: 'payment-1' }] });
    await expect(service.cancelConsolidation('parent-1', undefined, allowedUser)).rejects.toThrow(/paiements/);
    expect(tx.sale.update).not.toHaveBeenCalled();
    expect(tx.saleConsolidationSource.updateMany).not.toHaveBeenCalled();
  });

  it('bloque un avoir actif et un document final envoyé', async () => {
    const withCredit = build({ credits: [{ id: 'credit-1' }] });
    await expect(withCredit.service.cancelConsolidation('parent-1', undefined, allowedUser)).rejects.toThrow(/avoir actif/);
    const withFinalPdf = build({ documents: [{ status: 'SENT' }] });
    await expect(withFinalPdf.service.cancelConsolidation('parent-1', undefined, allowedUser)).rejects.toThrow(/finalisé/);
  });

  it('retourne 403 sans la permission dédiée', async () => {
    const { service, tx } = build();
    await expect(service.cancelConsolidation('parent-1', undefined, { ...allowedUser, permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.sale.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('conserve l’atomicité si la restauration d’une source échoue', async () => {
    const { service, tx } = build();
    tx.sale.update.mockRejectedValueOnce(new Error('database failure'));
    await expect(service.cancelConsolidation('parent-1', undefined, allowedUser)).rejects.toThrow('database failure');
    expect(tx.saleConsolidationSource.updateMany).not.toHaveBeenCalled();
  });
});
