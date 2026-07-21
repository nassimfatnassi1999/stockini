import type { Sale, SalesDocumentType } from "./types";

export type SelectableSale = Partial<Pick<
  Sale,
  "isConsolidated" | "consolidationStatus" | "status"
>> & {
  id?: unknown;
  customer?: { id?: unknown } | null;
  customerId?: unknown;
  activeConsolidation?: unknown;
  documentType?: unknown;
  type?: unknown;
  saleType?: unknown;
  sourceSaleIds?: unknown;
  consolidationGroupId?: unknown;
};

export interface SalesSelectionActions {
  consolidatedDocument: SelectableSale | null;
  consolidatedDocumentType: SalesDocumentType | null;
  generateLabel: string;
  hasAmbiguousConsolidatedSelection: boolean;
  showGenerate: boolean;
  showDeconsolidate: boolean;
  showConsolidate: boolean;
  consolidationError: string | null;
}

export function normalizeSalesDocumentType(
  value: unknown,
): SalesDocumentType | null {
  if (typeof value !== "string") return null;

  switch (value.trim().toUpperCase()) {
    case "QUOTE":
    case "DEVIS":
      return "DEVIS";
    case "ORDER":
    case "PURCHASE_ORDER":
    case "BON_COMMANDE":
      return "BON_COMMANDE";
    case "BL":
    case "DELIVERY_NOTE":
    case "BON_LIVRAISON":
      return "BON_LIVRAISON";
    case "INVOICE":
    case "FACTURE":
      return "FACTURE";
    case "CREDIT_NOTE":
    case "AVOIR":
      return "AVOIR";
    default:
      return null;
  }
}

/**
 * Derive toolbar actions exclusively from backend business fields. Document
 * references (BLG-/FACG-) are deliberately not inspected here.
 */
export function getSalesSelectionActions(
  selectedSales: SelectableSale[],
): SalesSelectionActions {
  const singleSale = selectedSales.length === 1 ? selectedSales[0] : null;
  const singleSaleType = normalizeSalesDocumentType(
    singleSale?.documentType ?? singleSale?.type ?? singleSale?.saleType,
  );
  const isSingleConsolidated = Boolean(
    singleSale &&
      (singleSale.isConsolidated === true ||
        singleSale.consolidationStatus === "ACTIVE" ||
        String(singleSale.consolidationStatus) === "CONSOLIDATED" ||
        (Array.isArray(singleSale.sourceSaleIds) &&
          singleSale.sourceSaleIds.length > 0) ||
        singleSale.consolidationGroupId),
  );
  const consolidatedDocument = isSingleConsolidated ? singleSale : null;
  const consolidationError = getConsolidationCompatibilityError(selectedSales);
  const hasAmbiguousConsolidatedSelection = false;
  const consolidatedDocumentType = consolidatedDocument
    ? singleSaleType
    : null;
  const isSupportedConsolidatedType =
    consolidatedDocumentType === "BON_LIVRAISON" ||
    consolidatedDocumentType === "FACTURE";

  return {
    consolidatedDocument,
    consolidatedDocumentType,
    generateLabel: "Générer",
    hasAmbiguousConsolidatedSelection,
    showGenerate:
      singleSale !== null &&
      singleSaleType !== null &&
      (!consolidatedDocument || isSupportedConsolidatedType),
    showDeconsolidate:
      consolidatedDocument !== null &&
      consolidatedDocument.consolidationStatus === "ACTIVE",
    showConsolidate: selectedSales.length > 1 && consolidationError === null,
    consolidationError,
  };
}

export function getConsolidationCompatibilityError(
  selectedSales: SelectableSale[],
): string | null {
  if (selectedSales.length < 2) return null;
  if (selectedSales.some((sale) => sale.status === "CANCELLED")) {
    return "Un document annulé ne peut pas être consolidé.";
  }
  if (selectedSales.some((sale) => !sale.isConsolidated && sale.activeConsolidation)) {
    return "Un document appartient déjà à une autre consolidation active.";
  }
  const customerIds = selectedSales.map((sale) =>
    String(sale.customer?.id ?? sale.customerId ?? ""),
  );
  if (!customerIds[0] || customerIds.some((id) => id !== customerIds[0])) {
    return "Les documents sélectionnés doivent appartenir au même client.";
  }
  const types = selectedSales.map((sale) =>
    normalizeSalesDocumentType(sale.documentType ?? sale.type ?? sale.saleType),
  );
  if (
    !types[0] ||
    !["BON_LIVRAISON", "FACTURE"].includes(types[0]) ||
    types.some((type) => type !== types[0])
  ) {
    return "Les documents sélectionnés ne sont pas compatibles. Sélectionnez des documents du même client et du même type.";
  }
  return null;
}
