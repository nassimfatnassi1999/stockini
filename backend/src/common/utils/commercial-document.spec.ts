import { DocumentType } from '@prisma/client';
import {
  isPayableSaleDocument,
  nonPayableFinancialState,
} from './commercial-document';

describe('commercial document payment policy', () => {
  it('keeps a DEVIS financially neutral', () => {
    expect(isPayableSaleDocument(DocumentType.DEVIS)).toBe(false);
    expect(nonPayableFinancialState()).toEqual({
      paidAmount: 0,
      remainingAmount: 0,
      paymentStatus: null,
    });
  });

  it.each([DocumentType.BON_LIVRAISON, DocumentType.FACTURE])(
    '%s remains payable',
    (documentType) => {
      expect(isPayableSaleDocument(documentType)).toBe(true);
    },
  );
});
