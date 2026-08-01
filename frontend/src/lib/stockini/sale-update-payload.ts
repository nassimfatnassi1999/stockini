export type SalePaymentPayload = {
  paymentAmount?: number;
  paymentMethod?: string;
  surplusDisposition?: string;
  acceptAsFullyPaid?: boolean;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function parseMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error("Le montant du paiement est invalide.");
  return round3(amount);
}

export function buildSalePaymentPayload(input: {
  paymentAmount: string | number | null | undefined;
  paymentMethod?: string;
  surplusDisposition?: string;
  acceptAsFullyPaid?: boolean;
}): SalePaymentPayload {
  const paymentAmount = parseMoney(input.paymentAmount);
  if (paymentAmount < 0) throw new Error("Le montant du paiement est invalide.");
  if (paymentAmount === 0) return {};
  if (!input.paymentMethod) {
    throw new Error("Veuillez sélectionner une méthode de paiement.");
  }
  return {
    paymentAmount,
    paymentMethod: input.paymentMethod,
    ...(input.surplusDisposition ? { surplusDisposition: input.surplusDisposition } : {}),
    acceptAsFullyPaid: Boolean(input.acceptAsFullyPaid),
  };
}
