import { calculateMarginAmount, calculateMarginOnCostPercent, calculateMarkupPercent, calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('canonical sales calculations', () => {
  it.each([
    ['sans remise', 100, 120, 20, 20],
    ['remise fournisseur BATTERIE L2', 207.742, 227.063, 19.321, 9.3],
    ['vente réellement à perte', 250, 220, -30, -12],
  ])('%s', (_label, cost, sale, expectedAmount, expectedRate) => {
    const amount = calculateMarginAmount(sale, cost);
    expect(amount).toBe(expectedAmount);
    expect(calculateMarginOnCostPercent(amount, cost)).toBe(expectedRate);
  });

  it('distingue marge sur coût et taux de marque', () => {
    expect(calculateMarginOnCostPercent(70, 200)).toBe(35);
    expect(calculateMarkupPercent(70, 270)).toBe(25.926);
  });

  it('applique séparément remise achat et remise vente', () => {
    const purchaseNet = 80;
    const sale = calculateSalesLine({ purchasePriceHt: purchaseNet, marginPercent: 275, discountPercent: 10, quantity: 1 });
    expect(sale.grossSalePriceHt).toBe(300);
    expect(sale.netSalePriceHt).toBe(270);
    expect(sale.marginAmount).toBe(190);
  });
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
