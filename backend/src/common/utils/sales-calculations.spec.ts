import { calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('canonical sales calculations', () => {
  it('applique exactement la règle v3 (PA 68,989, marge 40, remise 20)', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 68.989,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line).toMatchObject({
      grossSalePriceHt: 96.585,
      netSalePriceHt: 82.787,
      marginAmount: 13.798,
      marginAmountHt: 13.798,
      marginPercentOnCost: 20,
      totalHt: 82.787,
      taxAmount: 15.73,
      totalTtc: 98.517,
    });
    expect(calculateSalesTotals([line], 1)).toMatchObject({
      totalHt: 82.787,
      totalVat: 15.73,
      totalMarginHt: 13.798,
      totalTtc: 98.517,
      totalToPay: 99.517,
    });
  });

  it.each([
    ['remise 0%', 0, 140, 40],
    ['remise 10%', 10, 130, 30],
    ['remise égale à la marge', 40, 100, 0],
    ['remise supérieure à la marge', 50, 100, 0],
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

  it('ignore un PU déjà net et ne réapplique jamais la remise', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 68.989,
      grossSalePriceHt: 82.787,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line.netSalePriceHt).toBe(82.787);
    expect(line.totalHt).toBe(82.787);
    expect(line.marginAmount).toBe(13.798);
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
