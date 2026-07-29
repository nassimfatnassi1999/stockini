import {
  calculateCreditNoteLineTotals,
  calculateCreditNoteTotals,
} from './credit-note-calculation.util';

describe('credit note financial calculations', () => {
  it('uses Decimal ROUND_HALF_UP at three decimals', () => {
    expect(
      calculateCreditNoteLineTotals({
        quantity: 1,
        unitPriceHt: 1.0055,
        tvaRate: 19,
      }),
    ).toEqual({ totalHt: 1.006, totalTva: 0.191, totalTtc: 1.197 });
  });

  it('reverses only the returned quantities', () => {
    expect(
      calculateCreditNoteTotals([
        { quantity: 3, unitPriceHt: 83.3, tvaRate: 19 },
      ]),
    ).toEqual({ totalHt: 249.9, totalTva: 47.481, totalTtc: 297.381 });
  });
});
