import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSalesLine, calculateSalesTotals } from './salesCalculations';
import { calculatePurchaseLine, calculatePurchaseTotals } from './purchaseCalculations';

test('frontend: vecteur canonique de vente', () => {
  const line = calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 15, taxPercent: 19, quantity: 2 });
  assert.deepEqual({ gross: line.grossSalePriceHt, net: line.netSalePriceHt, marginUnit: line.marginAmount,
    marginTotal: line.marginAmountHt, marginPct: line.marginPercentOnCost, ht: line.totalHt, vat: line.taxAmount, ttc: line.totalTtc },
  { gross: 140, net: 125, marginUnit: 25, marginTotal: 50, marginPct: 25, ht: 250, vat: 47.5, ttc: 297.5 });
  assert.equal(calculateSalesTotals([line], 1).totalToPay, 298.5);
});

test('frontend: remises limites et seuil de marge', () => {
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 0, quantity: 1 }).netSalePriceHt, 140);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 10, quantity: 1 }).netSalePriceHt, 130);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 40, quantity: 1 }).netSalePriceHt, 100);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 50, quantity: 1 }).marginPercentOnCost, -10);

  const exact = calculateSalesLine({ purchasePriceHt: 35, marginPercent: 40, discountPercent: 20, taxPercent: 19, quantity: 1 });
  assert.deepEqual({ margin: exact.marginAmount, netHt: exact.totalHt, vat: exact.taxAmount, ttc: exact.totalTtc },
    { margin: 7, netHt: 42, vat: 7.98, ttc: 49.98 });
});

test('frontend: achat, somme des lignes et timbre saisi', () => {
  const lines = [calculatePurchaseLine({ quantity: 3, unitCost: 10.0055, discountPercent: 7.5, tvaPercent: 19 }),
    calculatePurchaseLine({ quantity: 2, unitCost: 0.3335, discountPercent: 0, tvaPercent: 7 })];
  const totals = calculatePurchaseTotals(lines, 2.3755);
  assert.equal(totals.subtotal, lines.reduce((sum, line) => sum + line.netHt, 0));
  assert.equal(totals.stampDuty, 2.376);
  assert.equal(totals.totalFinal, Number((totals.total + totals.stampDuty).toPrecision(15)));
});
