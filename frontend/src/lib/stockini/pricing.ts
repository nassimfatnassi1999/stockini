// Tunisian tax & margin constants — change here to propagate everywhere
export const TVA_RATE = 1.19;   // 19% TVA
export const MARGIN_RATE = 1.4; // 40% margin sur prix TTC

export function calcPurchasePriceTtc(priceHt: number): number {
  return priceHt * TVA_RATE;
}

export function calcSalePrice(priceHt: number): number {
  return priceHt * TVA_RATE * MARGIN_RATE;
}

export function roundPrice(value: number, decimals = 3): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
