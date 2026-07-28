import { calcPurchasePriceTtc, calcSalePrice } from './pricing.util';

describe('product pricing HT/TTC', () => {
  it('dérive sans masquer le millime lorsque seule la base HT est connue', () => {
    expect(calcPurchasePriceTtc(58.824, 19)).toBe(70.001);
    expect(calcSalePrice(58.824, 19)).toBe(82.354);
  });

  it('ne change pas le cas HT exact existant', () => {
    expect(calcPurchasePriceTtc(100, 19)).toBe(119);
    expect(calcSalePrice(100, 19)).toBe(140);
  });
});
