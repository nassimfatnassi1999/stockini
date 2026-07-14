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
  items: [],
  seller: null,
};

function createService(generatedDocument: Record<string, jest.Mock>) {
  const prisma = {
    sale: { findFirst: jest.fn().mockResolvedValue(sale) },
    generatedDocument,
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
    generatedDocument,
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
    const { service } = createService(generatedDocument);

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
});
