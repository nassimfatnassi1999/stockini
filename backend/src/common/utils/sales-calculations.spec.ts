import { calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('canonical sales calculations', () => {
  it('retire la remise du taux de marge (PA 35, marge 40, remise 20)', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 35,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line).toMatchObject({
      grossSalePriceHt: 49,
      netSalePriceHt: 42,
      marginAmount: 7,
      marginAmountHt: 7,
      marginPercentOnCost: 20,
      totalHt: 42,
      taxAmount: 7.98,
      totalTtc: 49.98,
    });
    expect(calculateSalesTotals([line], 1)).toMatchObject({
      totalHt: 42,
      totalVat: 7.98,
      totalMarginHt: 7,
      totalTtc: 49.98,
      totalToPay: 50.98,
    });
  });

  it.each([
    ['remise 0%', 0, 140, 40],
    ['remise 10%', 10, 130, 30],
    ['remise égale à la marge', 40, 100, 0],
    ['remise supérieure à la marge', 50, 90, -10],
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
    expect(totals.totalToPay).toBe(2.244);
  });
});
