export type SalePaymentPayload = {
  paidAmount: number;
  paymentMethod?: string;
  surplusDisposition?: string;
  acceptAsFullyPaid?: boolean;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function buildSalePaymentPayload(input: {
  paidAmount: number;
  existingPaidAmount?: number;
  paymentMethod?: string;
  surplusDisposition?: string;
  acceptAsFullyPaid?: boolean;
}): SalePaymentPayload {
  const paidAmount = round3(input.paidAmount);
  const existingPaidAmount = round3(input.existingPaidAmount ?? 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("Le montant du paiement est invalide.");
  }
  const paymentDelta = round3(paidAmount - existingPaidAmount);
  if (paymentDelta < 0) {
    throw new Error("Le total encaissé ne peut pas être inférieur aux encaissements existants.");
  }
  if (paymentDelta > 0 && !input.paymentMethod) {
    throw new Error("Veuillez sélectionner une méthode de paiement.");
  }
  return {
    paidAmount,
    ...(paymentDelta > 0 && input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(paymentDelta > 0 && input.surplusDisposition ? { surplusDisposition: input.surplusDisposition } : {}),
    ...(paymentDelta > 0 ? { acceptAsFullyPaid: Boolean(input.acceptAsFullyPaid) } : {}),
  };
}
