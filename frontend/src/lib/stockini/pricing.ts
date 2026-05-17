export const DEFAULT_TVA = 19;
export const MARGIN_RATE = 1.4;

export function calcPurchasePriceTtc(priceHt: number, tva: number = DEFAULT_TVA): number {
  return priceHt * (1 + tva / 100);
}

/** salePrice is always HT: purchaseHT × MARGIN_RATE (tva param kept for API compat) */
export function calcSalePrice(priceHt: number, _tva?: number): number {
  return priceHt * MARGIN_RATE;
}

export function roundPrice(value: number, decimals = 3): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
