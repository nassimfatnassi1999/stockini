import type { Sale, SalesDocumentType } from "./types";

type SelectableSale = Pick<
  Sale,
  "documentType" | "isConsolidated" | "consolidationStatus"
>;

export interface SalesSelectionActions {
  consolidatedDocument: SelectableSale | null;
  consolidatedDocumentType: SalesDocumentType | null;
  generateLabel: string;
  hasAmbiguousConsolidatedSelection: boolean;
  showGenerate: boolean;
  showDeconsolidate: boolean;
}

/**
 * Derive toolbar actions exclusively from backend business fields. Document
 * references (BLG-/FACG-) are deliberately not inspected here.
 */
export function getSalesSelectionActions(
  selectedSales: SelectableSale[],
): SalesSelectionActions {
  const singleSale = selectedSales.length === 1 ? selectedSales[0] : null;
  const consolidatedDocument = singleSale?.isConsolidated ? singleSale : null;
  const hasAmbiguousConsolidatedSelection =
    selectedSales.length > 1 &&
    selectedSales.some((sale) => sale.isConsolidated === true);
  const consolidatedDocumentType =
    consolidatedDocument &&
    (consolidatedDocument.documentType === "BON_LIVRAISON" ||
      consolidatedDocument.documentType === "FACTURE")
      ? consolidatedDocument.documentType
      : null;

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
      selectedSales.length > 0 &&
      !hasAmbiguousConsolidatedSelection &&
      (!consolidatedDocument || consolidatedDocumentType !== null),
    showDeconsolidate:
      consolidatedDocumentType !== null &&
      consolidatedDocument?.consolidationStatus === "ACTIVE",
  };
}
