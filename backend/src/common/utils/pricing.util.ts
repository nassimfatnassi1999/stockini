export const DEFAULT_TVA = 19;
export const MARGIN_RATE = 1.4;

export function calcPurchasePriceTtc(priceHt: number, tva: number = DEFAULT_TVA): number {
  return Math.round(priceHt * (1 + tva / 100) * 1000) / 1000;
}

export function calcSalePrice(priceHt: number, tva: number = DEFAULT_TVA): number {
  return Math.round(priceHt * (1 + tva / 100) * MARGIN_RATE * 1000) / 1000;
}
