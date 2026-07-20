import {
  DocumentStatus,
  DocumentType,
  Prisma,
} from '@prisma/client';
import { DocumentsService } from './documents.service';

const sale = {
  id: 'sale-1',
  invoiceNumber: 'DEV-002',
  customerId: null,
  customer: null,
  counterClientFullName: 'Client comptoir',
  counterClientAddress: null,
  counterClientPhone: null,
  counterClientTaxId: null,
  counterClientNote: null,
  clientType: 'COMPTOIR',
  createdAt: new Date('2026-07-01T10:00:00Z'),
  subtotal: 100,
  discount: 0,
  tax: 19,
  total: 119,
  stampDuty: 1,
  items: [
    {
      quantity: 1,
      unitPrice: 140,
      finalUnitPrice: 125,
      discountPercent: 15,
      tvaPercent: 19,
      total: 125,
      designation: 'Produit test',
      product: { reference: 'P-001', name: 'Produit test', tva: 19 },
    },
  ],
  seller: null,
};

function createService(generatedDocument: Record<string, jest.Mock>) {
  const prisma = {
    sale: { findFirst: jest.fn().mockResolvedValue(sale) },
    generatedDocument,
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const settings = { findAll: jest.fn().mockResolvedValue([]) };
  const minio = {
    bucket: 'documents',
    putObject: jest.fn().mockResolvedValue(undefined),
  };
  const pdf = {
    generateSaleDocument: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };

  return {
    service: new DocumentsService(
      prisma as never,
      settings as never,
      minio as never,
      pdf as never,
      {} as never,
    ),
    prisma,
    generatedDocument,
    pdf,
  };
}

describe('DocumentsService.generate', () => {
  const dto = {
    invoiceIds: ['sale-1'],
    documentType: DocumentType.DEVIS,
  };

  it('restores the canonical row when the document was soft-deleted', async () => {
    const deleted = {
      id: 'doc-1',
      documentNumber: 'DEVIS-DEV-002',
      status: DocumentStatus.DELETED,
    };
    const restored = { ...deleted, status: DocumentStatus.GENERATED };
    const generatedDocument = {
      findFirst: jest.fn().mockResolvedValue(deleted),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(restored),
    };
    const { service, pdf } = createService(generatedDocument);

    const result = await service.generate(dto);

    expect(result.documents).toEqual([restored]);
    expect(generatedDocument.create).not.toHaveBeenCalled();
    expect(generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          documentNumber: 'DEVIS-DEV-002',
          deletedAt: null,
          deletedBy: null,
        }),
      }),
    );
    expect(pdf.generateSaleDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ unitPrice: 125, total: 125 })],
      }),
      DocumentType.DEVIS,
      expect.any(Object),
    );
  });

  it('returns the winning row when concurrent creation raises P2002', async () => {
    const winner = {
      id: 'doc-winner',
      invoiceId: 'sale-1',
      documentType: DocumentType.DEVIS,
      documentNumber: 'DEVIS-DEV-002',
      status: DocumentStatus.GENERATED,
    };
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique conflict', {
      code: 'P2002',
      clientVersion: 'test',
      meta: {
        modelName: 'GeneratedDocument',
        target: ['documentNumber'],
      },
    });
    const generatedDocument = {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner),
      create: jest.fn().mockRejectedValue(conflict),
      update: jest.fn(),
    };
    const { service } = createService(generatedDocument);

    const result = await service.generate(dto);

    expect(result.documents).toEqual([winner]);
    expect(generatedDocument.findFirst).toHaveBeenLastCalledWith({
      where: {
        invoiceId: 'sale-1',
        documentType: DocumentType.DEVIS,
      },
    });
  });

  it('regenerates a consolidated PDF from its aggregate sale', async () => {
    const consolidatedSale = {
      ...sale,
      id: 'grouped-1',
      invoiceNumber: 'FACG-2026-001',
      documentType: DocumentType.FACTURE,
      isConsolidated: true,
      consolidationStatus: 'ACTIVE',
      stampDuty: 1,
      items: [
        { ...sale.items[0], sourceReference: 'FAC-001' },
        { ...sale.items[0], quantity: 2, sourceReference: 'FAC-002' },
      ],
      consolidationSources: [
        { sourceReference: 'FAC-001' },
        { sourceReference: 'FAC-002' },
      ],
    };
    const existing = {
      id: 'doc-grouped-1',
      documentNumber: 'FACG-2026-001',
      fileName: 'FACG-2026-001.pdf',
      minioObjectKey: 'documents/ventes/facture/2026/07/FACG-2026-001.pdf',
      status: DocumentStatus.GENERATED,
    };
    const regenerated = { ...existing, generatedAt: new Date() };
    const generatedDocument = {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(regenerated),
    };
    const created = createService(generatedDocument);
    created.prisma.sale.findFirst.mockResolvedValue(consolidatedSale);

    const result = await created.service.generate({
      invoiceIds: ['grouped-1'],
      documentType: DocumentType.FACTURE,
    });

    expect(result.documents).toEqual([regenerated]);
    expect(generatedDocument.create).not.toHaveBeenCalled();
    expect(generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: existing.id } }),
    );
    expect(created.pdf.generateSaleDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'FACG-2026-001',
        timbreFiscal: 1,
        sourceReferences: ['FAC-001', 'FAC-002'],
        items: [
          expect.objectContaining({ sourceReference: 'FAC-001' }),
          expect.objectContaining({ sourceReference: 'FAC-002', quantity: 2 }),
        ],
      }),
      DocumentType.FACTURE,
      expect.any(Object),
    );
  });
});
