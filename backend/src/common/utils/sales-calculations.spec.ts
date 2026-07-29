import { calculateMarginAmount, calculateMarginOnCostPercent, calculateMarkupPercent, calculateSalePriceFromPurchaseTtc, calculateSalesLine, calculateSalesTotals, salesRound3 } from './sales-calculations';

describe('canonical sales calculations', () => {
  it('calcule le vecteur de marge demandé avec quantité 4', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 70,
      grossSalePriceHt: 98,
      discountPercent: 15,
      quantity: 4,
    });
    expect(line).toMatchObject({
      netSalePriceHt: 83.3,
      marginAmount: 13.3,
      marginAmountHt: 53.2,
      marginPercentOnCost: 19,
    });
    expect(calculateMarkupPercent(line.marginAmount, line.netSalePriceHt)).toBe(
      15.966,
    );
  });

  it('calcule FD01B13120L depuis le PA TTC sans confusion HT/TTC', () => {
    expect(calculateSalePriceFromPurchaseTtc({ purchaseTtc: 70, markupPercent: 40, discountPercent: 15, vatPercent: 19 })).toEqual({
      saleTtcGross: 98,
      saleHtGross: 82.353,
      discountAmountTtc: 14.7,
      saleTtcNet: 83.3,
      saleHtNet: 70,
    });
    expect(calculateSalesLine({ purchasePriceHt: 58.824, purchasePriceTtc: 70, marginPercent: 40, discountPercent: 15, taxPercent: 19, quantity: 1 })).toMatchObject({
      grossSalePriceHt: 82.353,
      grossSalePriceTtc: 98,
      netSalePriceHt: 70,
      netSalePriceTtc: 83.3,
      discountAmountTtc: 14.7,
      totalTtc: 83.3,
    });
  });

  it('conserve le cas PA HT=100 et applique la remise au brut TTC', () => {
    const line = calculateSalesLine({ purchasePriceHt: 100, purchasePriceTtc: 119, marginPercent: 40, discountPercent: 15, taxPercent: 19, quantity: 1 });
    expect(line).toMatchObject({ grossSalePriceHt: 140, grossSalePriceTtc: 166.6, netSalePriceTtc: 141.61, netSalePriceHt: 119 });
  });

  it('respecte un prix brut manuel explicite et ne le dérive pas à nouveau', () => {
    const line = calculateSalesLine({ purchasePriceHt: 100, purchasePriceTtc: 119, grossSalePriceHt: 150, marginPercent: 40, discountPercent: 10, taxPercent: 19, quantity: 2 });
    expect(line.grossSalePriceHt).toBe(150);
    expect(line.totalTtc).toBe(321.3);
  });
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

  it('donne priorité au prix catalogue explicite lorsque le coût est connu', () => {
    const line = calculateSalesLine({
      purchasePriceHt: 68.989,
      grossSalePriceHt: 82.787,
      marginPercent: 40,
      discountPercent: 20,
      taxPercent: 19,
      quantity: 1,
    });
    expect(line.grossSalePriceHt).toBe(82.787);
    expect(line.netSalePriceHt).toBe(66.23);
    expect(line.totalHt).toBe(66.23);
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
    expect(totals.totalToPay).toBe(
      salesRound3(lines.reduce((sum, line) => sum + line.lineTtc, 0) + totals.fiscalStamp),
    );
  });
});
