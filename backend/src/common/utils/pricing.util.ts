// Tunisian tax & margin constants — change here to propagate everywhere
export const TVA_RATE = 1.19;
export const MARGIN_RATE = 1.4;

export function calcPurchasePriceTtc(priceHt: number): number {
  return Math.round(priceHt * TVA_RATE * 1000) / 1000;
}

export function calcSalePrice(priceHt: number): number {
  return Math.round(priceHt * TVA_RATE * MARGIN_RATE * 1000) / 1000;
}
