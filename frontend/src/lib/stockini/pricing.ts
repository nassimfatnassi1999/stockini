import Decimal from 'decimal.js';

export const DEFAULT_TVA = 19;
export const MARGIN_RATE = 1.4;
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const r3 = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();

export function calcPurchasePriceTtc(priceHt: number, tva: number = DEFAULT_TVA): number {
  return r3(new Decimal(priceHt).mul(new Decimal(1).plus(new Decimal(tva).div(100))));
}

/** Prix catalogue HT dérivé de la règle métier appliquée au PA TTC arrondi. */
export function calcSalePrice(priceHt: number, tva: number = DEFAULT_TVA): number {
  const vatFactor = new Decimal(1).plus(new Decimal(tva).div(100));
  return r3(new Decimal(calcPurchasePriceTtc(priceHt, tva)).mul(MARGIN_RATE).div(vatFactor));
}

export function roundPrice(value: number, decimals = 3): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
