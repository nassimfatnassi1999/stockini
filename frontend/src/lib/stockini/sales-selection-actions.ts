import type { Sale, SalesDocumentType } from "./types";

export type SelectableSale = Pick<
  Sale,
  "isConsolidated" | "consolidationStatus"
> & {
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
  const hasAmbiguousConsolidatedSelection =
    selectedSales.length > 1 &&
    selectedSales.some(
      (sale) =>
        sale.isConsolidated === true ||
        sale.consolidationStatus === "ACTIVE" ||
        String(sale.consolidationStatus) === "CONSOLIDATED" ||
        (Array.isArray(sale.sourceSaleIds) && sale.sourceSaleIds.length > 0) ||
        Boolean(sale.consolidationGroupId),
    );
  const consolidatedDocumentType = consolidatedDocument
    ? singleSaleType
    : null;
  const isSupportedConsolidatedType =
    consolidatedDocumentType === "BON_LIVRAISON" ||
    consolidatedDocumentType === "FACTURE";

  return {
    consolidatedDocument,
    consolidatedDocumentType,
    generateLabel:
      consolidatedDocumentType === "BON_LIVRAISON"
        ? "Générer le BL"
        : consolidatedDocumentType === "FACTURE"
          ? "Générer la facture"
          : "Générer",
    hasAmbiguousConsolidatedSelection,
    showGenerate:
      singleSale !== null &&
      singleSaleType !== null &&
      (!consolidatedDocument || isSupportedConsolidatedType),
    showDeconsolidate:
      consolidatedDocument !== null &&
      consolidatedDocument.consolidationStatus !== "CANCELLED",
  };
}
