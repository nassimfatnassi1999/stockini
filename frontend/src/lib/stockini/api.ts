import { api } from "@/lib/api";
import { cleanPaginationParams } from "@/lib/pagination";
import type {
  Alert,
  AuditLog,
  AuditLogPaginatedResult,
  AuditLogQuery,
  AuditLogStats,
  AuditRetentionSettings,
  ArchiveResult,
  CaisseBalance,
  CaisseMovement,
  CaisseMovementType,
  CreditNote,
  Customer,
  DocumentEmailLog,
  DocumentsListResponse,
  DocumentStatus,
  EmailPreview,
  GeneratedDocument,
  SalesDocumentType,
  ShareLinkResponse,
  DashboardReport,
  CreateExpensePayload,
  Expense,
  ExpensesQueryParams,
  ReportOverview,
  ReportOverviewQuery,
  PaginatedResponse,
  PayablePurchasesResponse,
  PayablePurchasesQueryParams,
  PurchasesQueryParams,
  SalesQueryParams,
  StockMovementsQueryParams,
  PaymentsQueryParams,
  Payment,
  Product,
  Purchase,
  PurchaseDetail,
  ReturnableItemsResponse,
  Sale,
  SaleDetail,
  StockMovement,
  Supplier,
  DropdownOption,
  TrashEntityType,
  TrashItem,
} from "./types";
import type { CreditNotePayload } from "@/features/avoirs/utils/credit-note-calculation";

const PAYABLE_METHODS = new Set(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK']);

function validatePayment(data: { amount: number; method: string }) {
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error('Le montant du paiement doit être supérieur à zéro.');
  }
  if (!PAYABLE_METHODS.has(data.method)) {
    throw new Error('Choisissez un mode de paiement valide (espèces, carte, virement ou chèque).');
  }
}

type ProductUpdatePayload = Omit<Partial<Product>, "quantity"> & {
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
};

export interface ProductsQueryParams {
  search?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  status?: "active" | "inactive";
  stockStatus?: "low" | "out" | "available";
  purchasePriceMin?: number;
  purchasePriceMax?: number;
  salePriceMin?: number;
  salePriceMax?: number;
}

function normalizeTrashItem(item: TrashItem): TrashItem {
  const entity = item.entity ?? item.entityType ?? item.entity_type;
  return {
    ...item,
    entity,
    entityType: entity,
    entity_type: entity,
  };
}

export function cleanQueryParams<T extends object>(
  params?: T,
): Partial<T> | undefined {
  if (!params) return undefined;

  const cleaned = Object.entries(params).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0)
      ) {
        return acc;
      }
      acc[key] = value;
      return acc;
    },
    {},
  );

  return Object.keys(cleaned).length > 0 ? (cleaned as Partial<T>) : undefined;
}

export const stockiniApi = {
  reportsOverview: (query?: ReportOverviewQuery) =>
    api
      .get<ReportOverview>("/reports/overview", {
        params: cleanQueryParams(query),
      })
      .then((r) => r.data),
  dashboard: () =>
    api.get<DashboardReport>("/reports/dashboard").then((r) => r.data),
  stockValue: () =>
    api
      .get<{ purchaseValue: number; saleValue: number }>("/reports/stock-value")
      .then((r) => r.data),
  topSelling: () => api.get("/reports/top-selling").then((r) => r.data),
  products: (params?: ProductsQueryParams) =>
    api
      .get<Product[]>("/products", { params: cleanQueryParams(params) })
      .then((r) => r.data),
  product: (id: string) =>
    api.get<Product>(`/products/${id}`).then((r) => r.data),
  createProduct: (
    data: Omit<Partial<Product>, "id" | "category" | "brand" | "supplier"> & {
      categoryId: string;
      brandId: string;
      supplierId?: string;
    },
  ) => api.post<Product>("/products", data).then((r) => r.data),
  updateProduct: (id: string, data: ProductUpdatePayload) => {
    const productData = { ...data };
    delete (productData as ProductUpdatePayload & { quantity?: unknown })
      .quantity;

    return api
      .patch<Product>(`/products/${id}`, productData)
      .then((r) => r.data);
  },
  deleteProduct: (id: string) =>
    api.delete(`/products/${id}`).then((r) => r.data),
  customers: () => api.get<Customer[]>("/customers").then((r) => r.data),
  customer: (id: string) =>
    api.get<Customer>(`/customers/${id}`).then((r) => r.data),
  updateCustomer: (id: string, data: Partial<Customer>) =>
    api.patch<Customer>(`/customers/${id}`, data).then((r) => r.data),
  suppliers: () => api.get<Supplier[]>("/suppliers").then((r) => r.data),
  createSupplier: (data: Partial<Supplier>) =>
    api.post<Supplier>("/suppliers", data).then((r) => r.data),
  updateSupplier: (id: string, data: Partial<Supplier>) =>
    api.patch<Supplier>(`/suppliers/${id}`, data).then((r) => r.data),
  deleteSupplier: (id: string) =>
    api.delete(`/suppliers/${id}`).then((r) => r.data),
  sales: (params?: SalesQueryParams) =>
    api
      .get<
        PaginatedResponse<Sale>
      >("/sales", { params: cleanPaginationParams(params) })
      .then((r) => r.data),
  sale: (id: string) => api.get<SaleDetail>(`/sales/${id}`).then((r) => r.data),
  saleNextReference: (documentType: SalesDocumentType) =>
    api
      .get<{
        reference: string;
      }>("/sales/next-reference", { params: { documentType } })
      .then((r) => r.data),
  createSale: (data: unknown) =>
    api.post<Sale>("/sales", data).then((r) => r.data),
  updateSale: (id: string, data: Partial<Sale>) =>
    api.patch<Sale>(`/sales/${id}`, data).then((r) => r.data),
  validateSale: (id: string) =>
    api.patch(`/sales/${id}/validate`).then((r) => r.data),
  cancelSale: (id: string) =>
    api.patch(`/sales/${id}/cancel`).then((r) => r.data),
  deleteSale: (id: string) => api.delete(`/sales/${id}`).then((r) => r.data),
  transformSale: (id: string, targetType: SalesDocumentType) =>
    api
      .post<Sale>(`/sales/${id}/transform`, { targetType })
      .then((r) => r.data),
  purchases: (params?: PurchasesQueryParams) =>
    api
      .get<
        PaginatedResponse<Purchase>
      >("/purchases", { params: cleanPaginationParams(params) })
      .then((r) => r.data),
  payablePurchases: (params?: PayablePurchasesQueryParams) =>
    api
      .get<PayablePurchasesResponse>("/purchases/payable", {
        params: cleanQueryParams(params),
      })
      .then((r) => r.data),
  purchase: (id: string) =>
    api.get<PurchaseDetail>(`/purchases/${id}`).then((r) => r.data),
  purchasePdf: (id: string) =>
    api.get<Blob>(`/purchases/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  createPurchase: (data: unknown) =>
    api.post<Purchase>("/purchases", data).then((r) => r.data),
  receivePurchase: (
    id: string,
    items: Array<{ purchaseItemId: string; quantity: number }>,
    references?: {
      supplierReference?: string;
    },
  ) =>
    api
      .patch<Purchase>(`/purchases/${id}/receive`, { items, ...references })
      .then((r) => r.data),
  updatePurchase: (id: string, data: Partial<Purchase>) =>
    api.patch<Purchase>(`/purchases/${id}`, data).then((r) => r.data),
  cancelPurchase: (id: string) =>
    api.patch(`/purchases/${id}/cancel`).then((r) => r.data),
  transformPurchase: (id: string, targetType: 'BON_RECEPTION' | 'FACTURE_FOURNISSEUR') =>
    api.post<Purchase>(`/purchases/${id}/transform`, { targetType }).then((r) => r.data),
  deletePurchase: (id: string) =>
    api.delete(`/purchases/${id}`).then((r) => r.data),
  payments: (params?: PaymentsQueryParams) =>
    api
      .get<
        PaginatedResponse<Payment>
      >("/payments", { params: cleanPaginationParams(params) })
      .then((r) => r.data),
  createPayment: (data: Partial<Payment>) =>
    api.post<Payment>("/payments", data).then((r) => r.data),
  updatePayment: (id: string, data: Partial<Payment>) =>
    api.patch<Payment>(`/payments/${id}`, data).then((r) => r.data),
  deletePayment: (id: string) =>
    api.delete(`/payments/${id}`).then((r) => r.data),
  expenses: (params?: ExpensesQueryParams) =>
    api
      .get<PaginatedResponse<Expense>>("/expenses", {
        params: cleanPaginationParams(params),
      })
      .then((r) => r.data),
  createExpense: (data: CreateExpensePayload) =>
    api.post<Expense>("/expenses", data).then((r) => r.data),
  cancelExpense: (id: string, reason?: string) =>
    api.patch<Expense>(`/expenses/${id}/cancel`, { reason }).then((r) => r.data),
  paySale: (
    saleId: string,
    data: { amount: number; method: string; note?: string },
  ) => {
    validatePayment(data);
    return api
      .post<Payment>(`/payments/sales/${saleId}/pay`, data)
      .then((r) => r.data);
  },
  payPurchase: (
    purchaseId: string,
    data: { amount: number; method: string; note?: string },
  ) => {
    validatePayment(data);
    return api
      .post<Payment>(`/payments/purchases/${purchaseId}/pay`, data)
      .then((r) => r.data);
  },
  alerts: () => api.get<Alert[]>("/alerts").then((r) => r.data),
  createAlert: (data: Partial<Alert>) =>
    api.post<Alert>("/alerts", data).then((r) => r.data),
  updateAlert: (id: string, data: Partial<Alert>) =>
    api.patch<Alert>(`/alerts/${id}`, data).then((r) => r.data),
  deleteAlert: (id: string) => api.delete(`/alerts/${id}`).then((r) => r.data),
  movements: (params?: StockMovementsQueryParams) =>
    api
      .get<
        PaginatedResponse<StockMovement>
      >("/stock/movements", { params: cleanPaginationParams(params) })
      .then((r) => r.data),
  stockEntry: (data: {
    productId: string;
    quantity: number;
    reason?: string;
  }) => api.post<StockMovement>("/stock/entry", data).then((r) => r.data),
  stockExit: (data: { productId: string; quantity: number; reason?: string }) =>
    api.post<StockMovement>("/stock/exit", data).then((r) => r.data),
  stockAdjustment: (data: {
    productId: string;
    newQuantity: number;
    reason?: string;
  }) => api.post<StockMovement>("/stock/adjustment", data).then((r) => r.data),
  resetInventory: (data: { adminPassword: string; confirmationText: string }) =>
    api
      .post<{
        success: boolean;
        previousTotal: number;
        productsImpacted: number;
        message: string;
      }>("/stock/reset-inventory", data)
      .then((r) => r.data),
  settings: () =>
    api
      .get<Array<{ key: string; value: string }>>("/settings")
      .then((r) => r.data),
  createSetting: (data: { key: string; value: string }) =>
    api.post("/settings", data).then((r) => r.data),
  updateSetting: (key: string, data: { value: string }) =>
    api.patch(`/settings/${key}`, data).then((r) => r.data),
  deleteSetting: (key: string) =>
    api.delete(`/settings/${key}`).then((r) => r.data),
  dropdownCategories: () =>
    api
      .get<
        Array<{ category: string; _count: { _all: number } }>
      >("/settings/dropdown-options/categories")
      .then((r) => r.data),
  dropdownOptions: () =>
    api.get<DropdownOption[]>("/settings/dropdown-options").then((r) => r.data),
  dropdownOptionsByCategory: (category: string) =>
    api
      .get<DropdownOption[]>(`/settings/dropdown-options/${category}`)
      .then((r) => r.data),
  createDropdownOption: (data: Partial<DropdownOption>) =>
    api
      .post<DropdownOption>("/settings/dropdown-options", data)
      .then((r) => r.data),
  updateDropdownOption: (id: string, data: Partial<DropdownOption>) =>
    api
      .put<DropdownOption>(`/settings/dropdown-options/${id}`, data)
      .then((r) => r.data),
  toggleDropdownOption: (id: string, active: boolean) =>
    api
      .patch<DropdownOption>(`/settings/dropdown-options/${id}/active`, {
        active,
      })
      .then((r) => r.data),
  deleteDropdownOption: (id: string) =>
    api.delete(`/settings/dropdown-options/${id}`).then((r) => r.data),
  trash: (entity?: TrashEntityType) =>
    api
      .get<TrashItem[]>("/trash", { params: entity ? { entity } : undefined })
      .then((r) => r.data.map(normalizeTrashItem)),
  restoreTrashItem: (entity: TrashEntityType, id: string) =>
    api.patch(`/trash/${entity}/${id}/restore`).then((r) => r.data),
  previewTrashDeleteImpact: (entity: TrashEntityType, id: string) =>
    api
      .get<import("./types").DeleteImpactResult>(`/trash/${entity}/${id}/delete-impact`)
      .then((r) => r.data),
  permanentDeleteTrashItem: (
    entity: TrashEntityType,
    id: string,
    confirmCascade?: boolean,
  ) =>
    api
      .delete(`/trash/${entity}/${id}/permanent`, {
        data: { confirmCascade: confirmCascade ?? false },
      })
      .then((r) => r.data),
  emptyTrash: () =>
    api
      .delete<{
        deletedCount: number;
        failedCount: number;
        errors: string[];
      }>("/trash/empty")
      .then((r) => r.data),
  auditLogs: (query?: AuditLogQuery) =>
    api
      .get<AuditLogPaginatedResult>("/audit-logs", { params: query })
      .then((r) => r.data),
  auditLogStats: () =>
    api.get<AuditLogStats>("/audit-logs/stats").then((r) => r.data),
  auditRetentionSettings: () =>
    api.get<AuditRetentionSettings>("/audit-logs/retention-settings").then((r) => r.data),
  updateRetentionSettings: (dto: Partial<AuditRetentionSettings>) =>
    api.patch<void>("/audit-logs/retention-settings", dto).then((r) => r.data),
  triggerAuditArchive: () =>
    api.post<ArchiveResult>("/audit-logs/archive").then((r) => r.data),
  listAuditArchives: () =>
    api.get<string[]>("/audit-logs/archives").then((r) => r.data),
  getLastAuditArchiveDownload: () =>
    api.get<{ objectKey: string; url: string } | null>("/audit-logs/archives/download").then((r) => r.data),
  recalculateLastSalePrices: () =>
    api
      .post<{
        productsUpdated: number;
        historyRows: number;
      }>("/admin/recalculate-last-sale-prices")
      .then((r) => r.data),

  // ── Generated Documents ───────────────────────────────────────────────────
  generateDocuments: (invoiceIds: string[], documentType: SalesDocumentType) =>
    api
      .post<{
        documents: GeneratedDocument[];
      }>("/documents/generate", { invoiceIds, documentType })
      .then((r) => r.data),

  /** Legacy flat list — used by ventes page GeneratedDocumentsHistory */
  generatedDocuments: (invoiceId?: string) =>
    api
      .get<
        GeneratedDocument[]
      >("/documents/generated", { params: invoiceId ? { invoiceId } : undefined })
      .then((r) => r.data),

  /** Paginated list with rich filters — used by /documents page */
  listDocuments: (params?: {
    documentType?: SalesDocumentType;
    clientId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    minSize?: number;
    maxSize?: number;
    status?: DocumentStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) =>
    api
      .get<DocumentsListResponse>("/documents", {
        params: cleanPaginationParams(params),
      })
      .then((r) => r.data),

  documentDetail: (id: string) =>
    api.get<GeneratedDocument>(`/documents/${id}`).then((r) => r.data),

  updateDocument: (
    id: string,
    data: {
      documentNumber?: string;
      clientName?: string;
      status?: DocumentStatus;
    },
  ) => api.put<GeneratedDocument>(`/documents/${id}`, data).then((r) => r.data),

  documentPresignedUrl: (id: string) =>
    api
      .get<{ url: string }>(`/documents/${id}/presigned-url`)
      .then((r) => r.data),

  viewDocument: (id: string): Promise<Blob> =>
    api
      .get(`/documents/${id}/view`, { responseType: "blob" })
      .then((r) => r.data as Blob),

  downloadDocument: (id: string): Promise<Blob> =>
    api
      .get(`/documents/${id}/download`, { responseType: "blob" })
      .then((r) => r.data as Blob),

  emailPreview: (documentIds: string[]) =>
    api
      .post<EmailPreview>("/documents/email-preview", { documentIds })
      .then((r) => r.data),

  sendDocumentEmail: (payload: {
    documentIds: string[];
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
  }) =>
    api
      .post<{
        success: boolean;
        emailStatus: string;
      }>("/documents/send-email", payload)
      .then((r) => r.data),

  sendEmailForDocument: (
    id: string,
    payload: {
      to: string;
      cc?: string;
      bcc?: string;
      subject: string;
      message?: string;
    },
  ) =>
    api
      .post<{
        success: boolean;
        emailStatus: string;
      }>(`/documents/${id}/send-email`, payload)
      .then((r) => r.data),

  documentEmailLogs: (id: string) =>
    api
      .get<DocumentEmailLog[]>(`/documents/${id}/email-logs`)
      .then((r) => r.data),

  regenerateDocument: (id: string) =>
    api
      .post<GeneratedDocument>(`/documents/${id}/regenerate`)
      .then((r) => r.data),

  deleteGeneratedDocument: (id: string) =>
    api.delete(`/documents/${id}`).then((r) => r.data),

  shareLink: (id: string, expiresInDays?: 1 | 7 | 30) =>
    api
      .post<ShareLinkResponse>(`/documents/${id}/share-link`, { expiresInDays })
      .then((r) => r.data),

  sendEmailLink: (
    id: string,
    payload: {
      to: string;
      subject?: string;
      message?: string;
      expiresInDays?: 1 | 7 | 30;
    },
  ) =>
    api
      .post<{
        success: boolean;
        emailStatus: string;
        expiresAt: string;
        expiresInDays: number;
      }>(`/documents/${id}/send-email-link`, payload)
      .then((r) => r.data),
  // ── Avoirs (Credit Notes) ─────────────────────────────────────────────────
  returnableItems: (saleId: string) =>
    api
      .get<ReturnableItemsResponse>(`/avoirs/sales/${saleId}/returnable-items`)
      .then((r) => r.data),
  avoirs: (params?: { customerId?: string; saleId?: string }) =>
    api.get<CreditNote[]>("/avoirs", { params }).then((r) => r.data),
  avoir: (id: string) =>
    api.get<CreditNote>(`/avoirs/${id}`).then((r) => r.data),
  createAvoir: (data: CreditNotePayload) =>
    api.post<CreditNote>("/avoirs", data).then((r) => r.data),
  avoirsByCustomer: (customerId: string) =>
    api.get<CreditNote[]>(`/avoirs/clients/${customerId}`).then((r) => r.data),
  /** Historique des avoirs liés à une facture ou un BL */
  saleCreditNotes: (saleId: string) =>
    api
      .get<CreditNote[]>(`/avoirs/sales/${saleId}/credit-notes`)
      .then((r) => r.data),
  avoirPdf: (id: string): Promise<Blob> =>
    api.get(`/avoirs/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),

  // ── Caisse ────────────────────────────────────────────────────────────────
  caisseBalance: () =>
    api.get<CaisseBalance>("/caisse/balance").then((r) => r.data),
  caisseHistorique: (type?: CaisseMovementType) =>
    api
      .get<
        CaisseMovement[]
      >("/caisse/historique", { params: type ? { type } : undefined })
      .then((r) => r.data),
  caisseRetrait: (data: { montant: number; motif?: string }) =>
    api.post<CaisseMovement>("/caisse/retrait", data).then((r) => r.data),
  caisseDepot: (data: { montant: number; motif?: string }) =>
    api.post<CaisseMovement>("/caisse/depot", data).then((r) => r.data),
  caisseSetAllowNegative: (allowNegative: boolean) =>
    api.patch("/caisse/config", { allowNegative }).then((r) => r.data),

  // ── Vider l'historique (soft-clear, display only) ─────────────────────────
  clearCustomerPaymentsHistory: (filters?: { dateFrom?: string; dateTo?: string; customerId?: string }) =>
    api.post<{ count: number }>("/payments/history/clear", filters ?? {}).then((r) => r.data),
  clearSupplierPaymentsHistory: (filters?: { dateFrom?: string; dateTo?: string; supplierId?: string }) =>
    api.post<{ count: number }>("/payments/supplier-history/clear", filters ?? {}).then((r) => r.data),
  clearCaisseHistory: (filters?: { dateFrom?: string; dateTo?: string; type?: string }) =>
    api.post<{ count: number }>("/caisse/history/clear", filters ?? {}).then((r) => r.data),

  categories: () =>
    api
      .get<
        Array<{ id: string; name: string; description?: string }>
      >("/categories")
      .then((r) => r.data),
  createCategory: (data: { name: string; description?: string }) =>
    api.post("/categories", data).then((r) => r.data),
  updateCategory: (id: string, data: { name?: string; description?: string }) =>
    api.patch(`/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) =>
    api.delete(`/categories/${id}`).then((r) => r.data),
  brands: () =>
    api.get<Array<{ id: string; name: string }>>("/brands").then((r) => r.data),
  createBrand: (data: { name: string }) =>
    api.post("/brands", data).then((r) => r.data),
  updateBrand: (id: string, data: { name?: string }) =>
    api.patch(`/brands/${id}`, data).then((r) => r.data),
  deleteBrand: (id: string) => api.delete(`/brands/${id}`).then((r) => r.data),
};
