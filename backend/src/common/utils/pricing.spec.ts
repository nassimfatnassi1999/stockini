import { calcPurchasePriceTtc, calcSalePrice } from './pricing.util';

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function calcSaleLineTotals(opts: {
  quantity: number;
  purchasePriceHt: number;
  unitPriceHt: number;
  discountPercent: number;
  tvaRate: number;
}) {
  const { quantity, purchasePriceHt, unitPriceHt, discountPercent, tvaRate } = opts;
  const baseHt = round3(quantity * unitPriceHt);
  const discountAmount = round3(baseHt * discountPercent / 100);
  const netHt = round3(baseHt - discountAmount);
  const tvaAmount = round3(netHt * tvaRate / 100);
  const netTtc = round3(netHt + tvaAmount);
  const netUnitPriceHt = round3(unitPriceHt * (1 - discountPercent / 100));
  const margeDt = round3(netUnitPriceHt - purchasePriceHt) * quantity;
  const margePercent = purchasePriceHt > 0
    ? Math.round(((netUnitPriceHt - purchasePriceHt) / purchasePriceHt) * 10000) / 100
    : 0;
  return { baseHt, discountAmount, netHt, netTtc, margeDt, margePercent };
}

describe('pricing formulas', () => {
  describe('calcPurchasePriceTtc', () => {
    it('cas 1: achatHT=135, TVA=19 → achatTTC=160.650', () => {
      expect(calcPurchasePriceTtc(135, 19)).toBe(160.65);
    });
  });

  describe('calcSalePrice (HT)', () => {
    it('cas 1: achatHT=135, marge=40% → venteHT=189.000', () => {
      expect(calcSalePrice(135)).toBe(189);
    });

    it('salePrice HT × (1+TVA%) = venteTTC=224.910', () => {
      const saleHt = calcSalePrice(135);
      const saleTtc = round3(saleHt * (1 + 19 / 100));
      expect(saleHt).toBe(189);
      expect(saleTtc).toBe(224.91);
    });
  });

  describe('calcSaleLineTotals', () => {
    it('cas 2: qty=1, puHt=189, remise=0, TVA=19, purchase=135', () => {
      const r = calcSaleLineTotals({ quantity: 1, purchasePriceHt: 135, unitPriceHt: 189, discountPercent: 0, tvaRate: 19 });
      expect(r.netHt).toBe(189);
      expect(r.netTtc).toBe(224.91);
      expect(r.margeDt).toBe(54);
      expect(r.margePercent).toBeCloseTo(40, 2);
    });

    it('cas 3: qty=1, puHt=205 (manuel), remise=0, TVA=19, purchase=135', () => {
      const r = calcSaleLineTotals({ quantity: 1, purchasePriceHt: 135, unitPriceHt: 205, discountPercent: 0, tvaRate: 19 });
      expect(r.netHt).toBe(205);
      expect(r.netTtc).toBe(243.95);
      expect(r.margeDt).toBe(70);
      expect(r.margePercent).toBeCloseTo(51.85, 1);
    });

    it('cas 4: qty=2, puHt=205, remise=10%, TVA=19, purchase=135', () => {
      const r = calcSaleLineTotals({ quantity: 2, purchasePriceHt: 135, unitPriceHt: 205, discountPercent: 10, tvaRate: 19 });
      expect(r.baseHt).toBe(410);
      expect(r.discountAmount).toBe(41);
      expect(r.netHt).toBe(369);
      expect(r.netTtc).toBe(439.11);
      expect(r.margeDt).toBe(99);
    });
  });
});
