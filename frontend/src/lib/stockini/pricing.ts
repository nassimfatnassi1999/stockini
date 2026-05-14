export const DEFAULT_TVA = 19;
export const MARGIN_RATE = 1.4;

export function calcPurchasePriceTtc(priceHt: number, tva: number = DEFAULT_TVA): number {
  return priceHt * (1 + tva / 100);
}

export function calcSalePrice(priceHt: number, tva: number = DEFAULT_TVA): number {
  return priceHt * (1 + tva / 100) * MARGIN_RATE;
}

export function roundPrice(value: number, decimals = 3): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
