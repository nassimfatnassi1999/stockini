import {
  calculatePurchaseLine,
  calculatePurchaseTotals,
} from './purchase-calculations';

describe('canonical purchase calculations', () => {
  it('arrondit chaque ligne puis somme les lignes et utilise le timbre saisi', () => {
    const lines = [
      calculatePurchaseLine({
        quantity: 3,
        unitCost: 10.0055,
        discountPercent: 7.5,
        tvaPercent: 19,
      }),
      calculatePurchaseLine({
        quantity: 2,
        unitCost: 0.3335,
        discountPercent: 0,
        tvaPercent: 7,
      }),
    ];
    const totals = calculatePurchaseTotals(lines, 2.3755);
    expect(totals.subtotal).toBe(lines[0].netHt + lines[1].netHt);
    expect(totals.tax).toBeCloseTo(lines[0].taxAmount + lines[1].taxAmount, 3);
    expect(totals.stampDuty).toBe(2.376);
    expect(totals.totalFinal).toBeCloseTo(totals.total + totals.stampDuty, 3);
  });
});
