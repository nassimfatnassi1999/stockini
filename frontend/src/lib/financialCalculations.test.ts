import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSalesLine, calculateSalesTotals } from './salesCalculations';
import { calculatePurchaseLine, calculatePurchaseTotals } from './purchaseCalculations';
import { createEmptyLine, recalculateSaleLine } from './stockini/register-utils';

test('frontend: vecteur canonique de vente', () => {
  const line = calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 15, taxPercent: 19, quantity: 2 });
  assert.deepEqual({ gross: line.grossSalePriceHt, net: line.netSalePriceHt, marginUnit: line.marginAmount,
    marginTotal: line.marginAmountHt, marginPct: line.marginPercentOnCost, ht: line.totalHt, vat: line.taxAmount, ttc: line.totalTtc },
  { gross: 140, net: 119, marginUnit: 19, marginTotal: 38, marginPct: 19, ht: 238, vat: 45.22, ttc: 283.22 });
  assert.equal(calculateSalesTotals([line], 1).totalToPay, 284.22);
});

test('frontend: remises limites et seuil de marge', () => {
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 0, quantity: 1 }).netSalePriceHt, 140);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 10, quantity: 1 }).netSalePriceHt, 126);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 40, quantity: 1 }).netSalePriceHt, 84);
  assert.equal(calculateSalesLine({ purchasePriceHt: 100, marginPercent: 40, discountPercent: 50, quantity: 1 }).marginPercentOnCost, -30);

  const exact = calculateSalesLine({ purchasePriceHt: 68.989, marginPercent: 40, discountPercent: 20, taxPercent: 19, quantity: 1 });
  assert.deepEqual({ margin: exact.marginAmount, netHt: exact.totalHt, vat: exact.taxAmount, ttc: exact.totalTtc },
    { margin: 8.279, netHt: 77.268, vat: 14.681, ttc: 91.949 });

  const restoredNetPu = calculateSalesLine({ purchasePriceHt: 68.989, grossSalePriceHt: 82.787,
    marginPercent: 40, discountPercent: 20, taxPercent: 19, quantity: 1 });
  assert.equal(restoredNetPu.netSalePriceHt, 77.268);
});

test('frontend: le rechargement du brouillon ne réapplique pas la remise', () => {
  const restored = recalculateSaleLine({
    ...createEmptyLine('draft-line'),
    productId: 'product-1',
    purchasePriceHt: 68.989,
    puHt: 82.787,
    defaultMarginPercent: 40,
    remisePercent: 20,
    tvaPercent: 19,
    quantity: 1,
    manualUnitPriceHt: true,
  });
  const restoredAgain = recalculateSaleLine(restored);
  assert.deepEqual({ puHt: restoredAgain.puHt, marginPct: restoredAgain.margePercent,
    margin: restoredAgain.margeAmount, netHt: restoredAgain.netHt, netTtc: restoredAgain.netTtc },
  { puHt: 96.585, marginPct: 12, margin: 8.279, netHt: 77.268, netTtc: 91.949 });
});

test('frontend: achat, somme des lignes et timbre saisi', () => {
  const lines = [calculatePurchaseLine({ quantity: 3, unitCost: 10.0055, discountPercent: 7.5, tvaPercent: 19 }),
    calculatePurchaseLine({ quantity: 2, unitCost: 0.3335, discountPercent: 0, tvaPercent: 7 })];
  const totals = calculatePurchaseTotals(lines, 2.3755);
  assert.equal(totals.subtotal, lines.reduce((sum, line) => sum + line.netHt, 0));
  assert.equal(totals.stampDuty, 2.376);
  assert.equal(totals.totalFinal, Number((totals.total + totals.stampDuty).toPrecision(15)));
});
