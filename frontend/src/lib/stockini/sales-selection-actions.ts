import type { Sale, SalesDocumentType } from "./types";

export type SelectableSale = Partial<Pick<
  Sale,
  "isConsolidated" | "consolidationStatus" | "status" | "deletedAt"
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
  total?: unknown;
  totalTtc?: unknown;
  totalTTC?: unknown;
  totalFinal?: unknown;
  stampDuty?: unknown;
};

export interface SalesConsolidationSelectionValidation {
  valid: boolean;
  error: string | null;
}

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
  const consolidationError =
    validateSalesConsolidationSelection(selectedSales).error;
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
  return validateSalesConsolidationSelection(selectedSales).error;
}

export function validateSalesConsolidationSelection(
  selectedSales: SelectableSale[],
): SalesConsolidationSelectionValidation {
  if (selectedSales.length < 2) return { valid: false, error: null };
  if (selectedSales.some((sale) => sale.status === "CANCELLED" || sale.deletedAt)) {
    return {
      valid: false,
      error: "Un document annulé ou supprimé ne peut pas être consolidé.",
    };
  }
  if (
    selectedSales.some(
      (sale) =>
        sale.isConsolidated &&
        sale.consolidationStatus !== "ACTIVE",
    )
  ) {
    return {
      valid: false,
      error: "Une consolidation remplacée ou inactive ne peut pas être regroupée.",
    };
  }
  if (selectedSales.some((sale) => !sale.isConsolidated && sale.activeConsolidation)) {
    return {
      valid: false,
      error: "Un document appartient déjà à une autre consolidation active.",
    };
  }
  const customerIds = selectedSales.map((sale) =>
    String(sale.customer?.id ?? sale.customerId ?? ""),
  );
  if (!customerIds[0] || customerIds.some((id) => id !== customerIds[0])) {
    return {
      valid: false,
      error: "Les documents sélectionnés doivent appartenir au même client.",
    };
  }
  const types = selectedSales.map((sale) =>
    normalizeSalesDocumentType(sale.documentType ?? sale.type ?? sale.saleType),
  );
  if (
    types.some(
      (type) => type !== "BON_LIVRAISON" && type !== "FACTURE",
    )
  ) {
    return {
      valid: false,
      error: "Seuls les bons de livraison et les factures peuvent être regroupés.",
    };
  }
  return { valid: true, error: null };
}

export function calculateSalesSelectionTotal(
  selectedSales: SelectableSale[],
  consolidatedStamp = 1,
): number {
  if (!selectedSales.length) return 0;
  if (selectedSales.length === 1) {
    const sale = selectedSales[0];
    const total = Number(
      sale.totalFinal ??
        sale.totalTtc ??
        sale.totalTTC ??
        Number(sale.total ?? 0) + Number(sale.stampDuty ?? 0),
    );
    return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : 0;
  }
  const sourcesTotal = selectedSales.reduce((sum, sale) => {
    const total = Number(sale.total ?? sale.totalTtc ?? sale.totalTTC ?? 0);
    return sum + (Number.isFinite(total) ? total : 0);
  }, 0);
  return Math.round((sourcesTotal + consolidatedStamp) * 1000) / 1000;
}
