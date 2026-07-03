import { calculateSalesLine } from './sales-calculations';

describe('calculateSalesLine', () => {
  it('PA 30, marge 40, remise 20, TVA 19, quantité 1', () => {
    expect(calculateSalesLine({ purchasePriceHt: 30, marginPercent: 40, discountPercent: 20, taxPercent: 19, quantity: 1 }))
      .toMatchObject({
        netMarginPercent: 20,
        marginAmount: 6,
        unitPriceHt: 36,
        unitPriceTtc: 42.84,
        totalTtc: 42.84,
      });
  });

  it.each([
    ['40%, remise 0%', 100, 40, 0, 19, 1, 40, 140, 166.6],
    ['40%, remise 15%', 100, 40, 15, 19, 2, 25, 125, 297.5],
    ['0%, remise 10%', 100, 0, 10, 19, 1, -10, 90, 107.1],
    ['10%, remise 20%', 100, 10, 20, 19, 1, -10, 90, 107.1],
    ['TVA 0%', 100, 40, 15, 0, 2, 25, 125, 250],
    ['quantité décimale', 80, 40, 5, 19, 2.5, 35, 108, 321.3],
    ['prix achat 0', 0, 40, 15, 19, 2, 25, 0, 0],
    ['valeurs décimales', 33.333, 12.5, 2.25, 7, 1.5, 10.25, 36.75, 58.984],
  ])('%s', (_label, purchase, margin, discount, tax, quantity, netMargin, unitHt, totalTtc) => {
    const result = calculateSalesLine({ purchasePriceHt: purchase as number, marginPercent: margin as number,
      discountPercent: discount as number, taxPercent: tax as number, quantity: quantity as number });
    expect(result.netMarginPercent).toBe(netMargin);
    expect(result.unitPriceHt).toBe(unitHt);
    expect(result.totalTtc).toBe(totalTtc);
  });

  it('uses defaults for empty margin and discount', () => {
    expect(calculateSalesLine({ purchasePriceHt: 100, marginPercent: null, discountPercent: null, taxPercent: 19, quantity: 1 }))
      .toMatchObject({ netMarginPercent: 40, unitPriceHt: 140, totalTtc: 166.6 });
  });
});
