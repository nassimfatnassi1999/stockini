export const DEFAULT_TVA = 19;
export const MARGIN_RATE = 1.4;

export function calcPurchasePriceTtc(
  priceHt: number,
  tva: number = DEFAULT_TVA,
): number {
  return Math.round(priceHt * (1 + tva / 100) * 1000) / 1000;
}

/** salePrice stored in DB is always HT: purchaseHT × MARGIN_RATE (tva param kept for signature compat) */
export function calcSalePrice(priceHt: number, _tva?: number): number {
  return Math.round(priceHt * MARGIN_RATE * 1000) / 1000;
}
