import { DocumentType } from '@prisma/client';
import { ReferenceGeneratorService } from './reference-generator.service';

describe('ReferenceGeneratorService sales document numbers', () => {
  it('sanitizes the client and formats the document date', async () => {
    const prisma = {
      referenceCounter: {
        upsert: jest.fn().mockResolvedValue({ sequence: 1 }),
      },
      sale: { findUnique: jest.fn().mockResolvedValue(null) },
      creditNote: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ReferenceGeneratorService(prisma as never);

    const number = await service.generateSalesDocumentNumber(
      DocumentType.DEVIS,
      'Auto Tôp S.A.R.L.',
      new Date(2026, 6, 1),
    );

    expect(number).toBe('DEV-AutoTopSARL-01072026-001');
  });

  it('increments atomically and skips a number that already exists', async () => {
    const prisma = {
      referenceCounter: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ sequence: 1 })
          .mockResolvedValueOnce({ sequence: 2 }),
      },
      sale: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'existing' })
          .mockResolvedValueOnce(null),
      },
      creditNote: { findUnique: jest.fn() },
    };
    const service = new ReferenceGeneratorService(prisma as never);

    const number = await service.generateSalesDocumentNumber(
      DocumentType.FACTURE,
      '',
      new Date(2026, 6, 1),
    );

    expect(number).toBe('FAC-Client-01072026-002');
    expect(prisma.referenceCounter.upsert).toHaveBeenCalledTimes(2);
  });

  it('uses the avoir prefix and checks the credit-note namespace', async () => {
    const prisma = {
      referenceCounter: {
        upsert: jest.fn().mockResolvedValue({ sequence: 7 }),
      },
      sale: { findUnique: jest.fn() },
      creditNote: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ReferenceGeneratorService(prisma as never);

    const number = await service.generateSalesDocumentNumber(
      DocumentType.AVOIR,
      'Comptoir',
      new Date(2026, 6, 1),
    );

    expect(number).toBe('AV-Comptoir-01072026-007');
    expect(prisma.creditNote.findUnique).toHaveBeenCalled();
  });
});
