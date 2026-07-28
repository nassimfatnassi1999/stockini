import {
  calculatePurchaseLine,
  calculatePurchaseTotals,
  calculateWeightedAverageCost,
} from './purchase-calculations';

describe('canonical purchase calculations', () => {
  it('calcule le coût unitaire net fournisseur avec arrondi HALF_UP à 3 décimales', () => {
    expect(calculatePurchaseLine({ quantity: 1, unitCost: 276.99, discountPercent: 25 })).toMatchObject({
      unitCostHtGross: 276.99,
      unitDiscountAmount: 69.248,
      unitCostHtNet: 207.742,
      lineTotalHtNet: 207.742,
    });
  });

  it('calcule le CUMP de plusieurs réceptions nettes et restaure un retour à son coût historique', () => {
    const first = calculateWeightedAverageCost({ currentQuantity: 0, currentUnitCostHtNet: 0, incomingQuantity: 2, incomingUnitCostHtNet: 100 });
    const second = calculateWeightedAverageCost({ currentQuantity: 2, currentUnitCostHtNet: first, incomingQuantity: 1, incomingUnitCostHtNet: 70 });
    expect(second).toBe(90);
    expect(calculateWeightedAverageCost({ currentQuantity: 2, currentUnitCostHtNet: 90, incomingQuantity: 1, incomingUnitCostHtNet: 100 })).toBe(93.333);
  });
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
