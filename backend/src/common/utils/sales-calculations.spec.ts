import { calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('canonical sales calculations', () => {
  it('applique la remise au prix de vente brut (PA 68,989, marge 40, remise 20)', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 68.989,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line).toMatchObject({
      grossSalePriceHt: 96.585,
      netSalePriceHt: 77.268,
      marginAmount: 8.279,
      marginAmountHt: 8.279,
      marginPercentOnCost: 12,
      totalHt: 77.268,
      taxAmount: 14.681,
      totalTtc: 91.949,
    });
    expect(calculateSalesTotals([line], 1)).toMatchObject({
      totalHt: 77.268,
      totalVat: 14.681,
      totalMarginHt: 8.279,
      totalTtc: 91.949,
      totalToPay: 92.949,
    });
  });

  it.each([
    ['remise 0%', 0, 140, 40],
    ['remise 10%', 10, 126, 26],
    ['remise de 40%', 40, 84, -16],
    ['remise de 50%', 50, 70, -30],
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

  it('utilise la marge comme source du prix catalogue lorsque le coût est connu', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 68.989,
      grossSalePriceHt: 82.787,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line.netSalePriceHt).toBe(77.268);
    expect(line.totalHt).toBe(77.268);
    expect(line.marginAmount).toBe(8.279);
  });

  it('calcule les cas financiers de référence sans remise et avec remise', () => {
    const full = calculateSalesLine({
      purchasePriceHt: 70,
      grossSalePriceHt: 98,
      marginPercent: 40,
      discountPercent: 0,
      quantity: 2,
    });
    const discounted = calculateSalesLine({
      purchasePriceHt: 70,
      grossSalePriceHt: 98,
      marginPercent: 40,
      discountPercent: 20,
      quantity: 2,
    });
    expect(full).toMatchObject({
      totalHt: 196,
      purchaseCostHt: 140,
      marginAmountHt: 56,
      marginPercentOnCost: 40,
    });
    expect(discounted).toMatchObject({
      totalHt: 156.8,
      purchaseCostHt: 140,
      marginAmountHt: 16.8,
      marginPercentOnCost: 12,
    });
    expect((discounted.marginAmountHt / discounted.totalHt) * 100).toBeCloseTo(
      10.714,
      3,
    );
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
