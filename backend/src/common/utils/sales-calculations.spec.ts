import { calculateSalesLine, calculateSalesTotals } from './sales-calculations';

describe('centralized sales calculations', () => {
  it('applies a 20% discount to the gross sale price (not to margin points)', () => {
    const line = calculateSalesLine({ purchasePriceHt: '68.989', grossSalePriceHt: '96.5846', discountPercent: 20, taxPercent: 19, quantity: 1 });
    expect(line.discountAmountHt).toBeCloseTo(19.31692, 8);
    expect(line.netSalePriceHt).toBeCloseTo(77.26768, 8);
    expect(line.marginAmountHt).toBeCloseTo(8.27868, 8);
    expect(line.vatAmount).toBeCloseTo(14.6808592, 8);
    expect(line.lineTtc).toBeCloseTo(91.9485392, 8);
    expect(calculateSalesTotals([line], 1)).toEqual(expect.objectContaining({
      totalHt: 77.268, totalVat: 14.681, totalMarginHt: 8.279, totalTtc: 91.949, totalToPay: 92.949,
    }));
  });

  it('supports an explicit final 20% markup as a separate business scenario', () => {
    const line = calculateSalesLine({ purchasePriceHt: '68.989', grossSalePriceHt: '82.7868', discountPercent: 0, taxPercent: 19, quantity: 1 });
    expect(line.netSalePriceHt).toBeCloseTo(82.7868, 8);
    expect(line.marginAmountHt).toBeCloseTo(13.7978, 8);
    expect(line.marginPercentOnCost).toBeCloseTo(20, 8);
    expect(line.vatAmount).toBeCloseTo(15.729492, 8);
    expect(line.lineTtc).toBeCloseTo(98.516292, 8);
    expect(calculateSalesTotals([line], 1).totalToPay).toBe(99.516);
  });

  it('keeps VAT and the document stamp outside commercial margin', () => {
    const line = calculateSalesLine({ purchasePriceHt: 100, grossSalePriceHt: 140, discountPercent: 10, taxPercent: 19, quantity: 2 });
    const totals = calculateSalesTotals([line], 1);
    expect(totals.totalMarginHt).toBe(52);
    expect(totals.totalToPay).toBe(300.88);
  });

  it('parses comma decimals and has no division by zero', () => {
    const line = calculateSalesLine({ purchasePriceHt: '0', grossSalePriceHt: '10,500', discountPercent: '5', taxPercent: '19', quantity: '2' });
    expect(line.netSalePriceHt).toBe(9.975);
    expect(line.marginPercentOnCost).toBe(0);
  });
});
