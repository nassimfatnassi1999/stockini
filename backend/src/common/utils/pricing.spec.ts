import { calcPurchasePriceTtc, calcSalePrice } from './pricing.util';
import { calculateSalesLine } from './sales-calculations';

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
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

  describe('calculateSalesLine', () => {
    it('retire la remise du taux de marge', () => {
      const r = calculateSalesLine({
        quantity: 2,
        purchasePriceHt: 100,
        marginPercent: 40,
        discountPercent: 15,
        taxPercent: 19,
      });
      expect(r.netMarginPercent).toBe(25);
      expect(r.unitPriceHt).toBe(125);
      expect(r.totalHt).toBe(250);
      expect(r.taxAmount).toBe(47.5);
      expect(r.totalTtc).toBe(297.5);
    });
  });
});
