import { calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('canonical sales calculations', () => {
  it('applique la remise au prix brut (PA 100, marge 40, remise 15, TVA 19, qté 2)', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 100,
      marginPercent: 40,
      discountPercent: 15,
      taxPercent: 19,
      quantity: 2,
    });
    expect(line).toMatchObject({
      grossSalePriceHt: 140,
      netSalePriceHt: 119,
      marginAmount: 19,
      marginAmountHt: 38,
      marginPercentOnCost: 19,
      totalHt: 238,
      taxAmount: 45.22,
      totalTtc: 283.22,
    });
    expect(calculateSalesTotals([line], 1)).toMatchObject({
      totalHt: 238,
      totalVat: 45.22,
      totalMarginHt: 38,
      totalTtc: 283.22,
      totalToPay: 284.22,
    });
  });

  it.each([
    ['remise 0%', 0, 140, 40],
    ['remise 100%', 100, 0, -100],
    ['marge nette sous 20%', 15, 119, 19],
  ])('%s', (_label, discount, expectedNet, expectedMargin) => {
    const line = calculateSalesLine({
      purchasePriceHt: 100,
      marginPercent: 40,
      discountPercent: discount,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line.netSalePriceHt).toBe(expectedNet);
    expect(line.marginPercentOnCost).toBe(expectedMargin);
  });

  it('la somme du document est exactement la somme des lignes arrondies', () => {
    const lines = [1, 2, 3].map(() =>
      calculateSalesLine({
        purchasePriceHt: 0.3335,
        marginPercent: 40,
        discountPercent: 12.5,
        taxPercent: 19,
        quantity: 1,
      }),
    );
    const totals = calculateSalesTotals(lines, 0.7255);
    expect(totals.totalHt).toBeCloseTo(
      lines.reduce((sum, line) => sum + line.totalHt, 0),
      3,
    );
    expect(totals.totalToPay).toBe(2.187);
  });
});
