import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSalesLine, calculateSalesTotals } from './salesCalculations';
import { calculatePurchaseLine, calculatePurchaseTotals } from './purchaseCalculations';

test('frontend: vecteur canonique de vente', () => {
  const line = calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 15, taxPercent: 19, quantity: 2 });
  assert.deepEqual({ gross: line.grossSalePriceHt, net: line.netSalePriceHt, marginUnit: line.marginAmount,
    marginTotal: line.marginAmountHt, marginPct: line.marginPercentOnCost, ht: line.totalHt, vat: line.taxAmount, ttc: line.totalTtc },
  { gross: 140, net: 119, marginUnit: 19, marginTotal: 38, marginPct: 19, ht: 238, vat: 45.22, ttc: 283.22 });
  assert.equal(calculateSalesTotals([line], 1).totalToPay, 284.22);
});

test('frontend: remises limites et seuil de marge', () => {
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 0, quantity: 1 }).netSalePriceHt, 140);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 100, quantity: 1 }).netSalePriceHt, 0);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 15, quantity: 1 }).marginPercentOnCost, 19);
});

test('frontend: achat, somme des lignes et timbre saisi', () => {
  const lines = [calculatePurchaseLine({ quantity: 3, unitCost: 10.0055, discountPercent: 7.5, tvaPercent: 19 }),
    calculatePurchaseLine({ quantity: 2, unitCost: 0.3335, discountPercent: 0, tvaPercent: 7 })];
  const totals = calculatePurchaseTotals(lines, 2.3755);
  assert.equal(totals.subtotal, lines.reduce((sum, line) => sum + line.netHt, 0));
  assert.equal(totals.stampDuty, 2.376);
  assert.equal(totals.totalFinal, Number((totals.total + totals.stampDuty).toPrecision(15)));
});
