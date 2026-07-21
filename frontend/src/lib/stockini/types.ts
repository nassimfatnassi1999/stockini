export type Id = string;

export interface Lookup {
  id: Id;
  name: string;
}

export interface Product {
  id: Id;
  idProduct: string;
  reference: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  tva: number | string; // TVA en % (défaut 19)
  purchasePrice: number | string; // Prix d'achat HT
  purchasePriceTtc: number | string; // Prix d'achat TTC (HT × (1 + TVA/100))
  salePrice: number | string; // Prix de vente HT (purchaseHT × 1.4)
  lastSellingPrice?: number | string | null;
  lastSaleDate?: string | null;
  lastSaleDocumentId?: string | null;
  lastSaleDocumentReference?: string | null;
  lastSaleDocumentType?: SalesDocumentType | null;
  lastSaleCustomerId?: string | null;
  quantity: number;
  minStock: number;
  location?: string | null;
  isActive: boolean;
  category?: Lookup;
  brand?: Lookup;
  supplier?: Lookup | null;
  lastSaleCustomer?: Customer | null;
}

export type CaisseMovementType =
  | "ENCAISSEMENT_VENTE"
  | "DECAISSEMENT_ACHAT"
  | "DEPENSE_GENERALE"
  | "DEPOT_MANUEL"
  | "RETRAIT_MANUEL"
  | "ANNULATION_VENTE"
  | "ANNULATION_ACHAT"
  | "ANNULATION_DEPENSE"
  | "CASH_RESET";

export type TreasuryAccount = "PHYSICAL_CASH" | "BANK_TREASURY";
export type ExpenseStatus = "ACTIVE" | "CANCELLED";

export interface CaisseMovement {
  id: Id;
  type: CaisseMovementType;
  treasuryAccount?: TreasuryAccount;
  account?: TreasuryAccount;
  montant: number | string;
  ancienSolde: number | string;
  nouveauSolde: number | string;
  motif?: string | null;
  referenceDoc?: string | null;
  expenseId?: string | null;
  userId?: string | null;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  user?: { id: Id; fullName: string; email: string } | null;
}

export interface CaisseBalance {
  solde?: number;
  soldeCaisse: number;
  soldeBanque: number;
  soldeGlobal: number;
  allowNegative: boolean;
  allowNegativeBanque?: boolean;
}

export interface Customer {
  id: Id;
  reference: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: "INDIVIDUAL" | "GARAGE" | "COMPANY";
  taxNumber?: string | null;
  creditBalance: number | string;
  debtAmount?: number;
  unpaidInvoicesCount?: number;
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedReason?: string | null;
  lockedByUserId?: string | null;
  debtDueDate?: string | null;
  autoLockEnabled?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface Supplier {
  id: Id;
  reference: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
  /** « Notre dette » : somme des restes à payer pour ce fournisseur (string Decimal). */
  totalDebt?: number | string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface PayablePurchasesResponse {
  data: Purchase[];
  count: number;
  totalRemaining: string;
}

export interface PayablePurchasesQueryParams {
  search?: string;
  supplierId?: string;
  paymentStatus?: string;
}

export interface Sale {
  id: Id;
  invoiceNumber: string;
  total: number | string;
  totalHT?: number | string;
  totalTVA?: number | string;
  totalTTC?: number | string;
  stampDuty: number | string;
  totalFinal: number | string;
  totalInitialTtc?: number | string | null;
  totalCurrentTtc?: number | string | null;
  paidAmount: number | string;
  remainingAmount: number | string;
  totalRefunded: number | string;
  creditNotesCount?: number;
  paymentStatus: string | null;
  status: string;
  documentType: SalesDocumentType;
  stockImpactDone: boolean;
  lastSalePriceImpactDone?: boolean;
  reserveStock: boolean;
  sourceDocumentId?: string | null;
  transformedToId?: string | null;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  customer?: Customer | null;
  clientType?: "PERSISTENT" | "COMPTOIR" | null;
  counterClientFirstName?: string | null;
  counterClientLastName?: string | null;
  counterClientFullName?: string | null;
  items?: Array<{ id: Id; quantity: number }>;
  deletedAt?: string | null;
  deletedBy?: string | null;
  isConsolidated?: boolean;
  consolidationStatus?: "ACTIVE" | "REPLACED" | "CANCELLED" | null;
  consolidationNote?: string | null;
  sourceDocumentsCount?: number;
  activeConsolidation?: { id: Id; invoiceNumber: string } | null;
}

export interface SaleItemDetail {
  id: Id;
  productId: Id;
  designation?: string | null;
  quantity: number;
  unitPrice: number | string;
  discountPercent?: number | string;
  marginPercent?: number | string | null;
  tvaPercent?: number | string | null;
  finalUnitPrice?: number | string | null;
  unitPurchaseCostHt?: number | string | null;
  purchaseCostEstimated?: boolean;
  calculationVersion?: number;
  total: number | string;
  sourceSaleId?: Id | null;
  sourceSaleItemId?: Id | null;
  sourceReference?: string | null;
  product?: {
    id: Id;
    reference: string;
    name: string;
    purchasePrice: number | string;
  } | null;
}

export interface SaleDetail {
  id: Id;
  invoiceNumber: string;
  documentType: SalesDocumentType;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  totalHT: number | string;
  totalTVA: number | string;
  totalTTC: number | string;
  stampDuty: number | string;
  totalFinal: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  customer?: Customer | null;
  clientType?: "PERSISTENT" | "COMPTOIR" | null;
  counterClientFirstName?: string | null;
  counterClientLastName?: string | null;
  counterClientFullName?: string | null;
  counterClientEmail?: string | null;
  counterClientPhone?: string | null;
  counterClientAddress?: string | null;
  counterClientTaxId?: string | null;
  counterClientNote?: string | null;
  items: SaleItemDetail[];
  isConsolidated?: boolean;
  consolidationStatus?: "ACTIVE" | "REPLACED" | "CANCELLED" | null;
  consolidationNote?: string | null;
  consolidationSources?: Array<{
    id: Id;
    sourceSaleId: Id;
    sourceReference: string;
    sourceType: SalesDocumentType;
    sourceTotal: number | string;
    active: boolean;
  }>;
  consolidationMemberships?: Array<{ consolidatedSale: Sale }>;
  payments?: Payment[];
  creditNotes?: CreditNote[];
  generatedDocuments?: GeneratedDocument[];
}

export type PurchaseDocumentType = 'BON_COMMANDE' | 'BON_RECEPTION' | 'FACTURE_FOURNISSEUR';

export interface Purchase {
  id: Id;
  orderNumber: string;
  total: number | string;
  totalHT?: number | string;
  totalTVA?: number | string;
  totalTTC?: number | string;
  stampDuty: number | string;
  totalFinal: number | string;
  supplierReference?: string | null;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  documentType: PurchaseDocumentType;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  supplier?: Supplier | null;
  items?: Array<{
    id: Id;
    quantity: number;
    receivedQuantity?: number;
    unitCost?: number | string;
  }>;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface PurchaseItemDetail {
  id: Id;
  productId: Id;
  quantity: number;
  receivedQuantity: number;
  unitCost: number | string;
  designation?: string | null;
  discountPercent?: number | string;
  tvaPercent?: number | string | null;
  total: number | string;
  product?: {
    id: Id;
    reference: string;
    name: string;
    purchasePrice?: number | string;
    tva?: number | string;
  } | null;
}

export interface PurchaseDetail {
  id: Id;
  orderNumber: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  totalHT: number | string;
  totalTVA: number | string;
  totalTTC: number | string;
  stampDuty: number | string;
  totalFinal: number | string;
  supplierReference?: string | null;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  documentType: PurchaseDocumentType;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  supplier?: Supplier | null;
  items: PurchaseItemDetail[];
}

export interface Payment {
  id: Id;
  reference: string;
  type: string;
  method: string;
  amount: number | string;
  note?: string | null;
  createdAt: string;
  customer?: Customer | null;
  supplier?: Supplier | null;
  sale?: Sale | null;
  purchase?: Purchase | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface Expense {
  id: Id;
  reference: string;
  amount: number | string;
  paymentSource: TreasuryAccount;
  category: string;
  expenseDate: string;
  description: string;
  supplierId?: Id | null;
  purchaseId?: Id | null;
  attachmentUrl?: string | null;
  status: ExpenseStatus;
  createdById?: Id | null;
  cancelledAt?: string | null;
  cancelledById?: Id | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier | null;
  purchase?: Pick<Purchase, "id" | "orderNumber"> | null;
  createdBy?: { id: Id; fullName: string; email: string } | null;
}

export interface ExpensesQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  paymentSource?: TreasuryAccount;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ExpenseStatus;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateExpensePayload {
  amount: number;
  paymentSource: TreasuryAccount;
  category: string;
  date: string;
  description: string;
  supplierId?: string;
  purchaseId?: string;
  attachmentUrl?: string;
}

export type SalesDocumentType =
  | "DEVIS"
  | "BON_COMMANDE"
  | "BON_LIVRAISON"
  | "FACTURE"
  | "AVOIR";
export type EmailStatus = "PENDING" | "SENT" | "FAILED";
export type DocumentStatus = "GENERATED" | "SENT" | "DELETED";

export interface GeneratedDocument {
  id: Id;
  invoiceId: Id;
  clientId?: Id | null;
  clientName?: string | null;
  documentType: SalesDocumentType;
  documentNumber: string;
  fileName: string;
  minioBucket: string;
  minioObjectKey: string;
  fileSize?: number | null;
  mimeType: string;
  totalHt?: number | string | null;
  totalTva?: number | string | null;
  totalTtc?: number | string | null;
  stampDuty: number | string;
  totalFinal?: number | string | null;
  generatedBy?: Id | null;
  generatedAt: string;
  status: DocumentStatus;
  deletedAt?: string | null;
  emailStatus: EmailStatus;
  sentAt?: string | null;
  sentTo?: string | null;
  sale?: {
    invoiceNumber: string;
    subtotal?: number | string | null;
    tax?: number | string | null;
    total?: number | string | null;
    stampDuty?: number | string | null;
    totalFinal?: number | string | null;
    customer?: { name: string; email?: string | null } | null;
  } | null;
  generator?: { fullName: string } | null;
  emailLogs?: DocumentEmailLog[];
}

export interface DocumentEmailLog {
  id: Id;
  documentId: Id;
  recipientEmail: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  message?: string | null;
  sentAt: string;
  sentBy?: Id | null;
  status: EmailStatus;
  errorMessage?: string | null;
  createdAt: string;
}

export interface DocumentsListResponse {
  data: GeneratedDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EmailPreview {
  to: string;
  subject: string;
  body: string;
  attachments: Array<{ documentId: Id; fileName: string }>;
}

export interface ShareLinkResponse {
  url: string;
  expiresAt: string;
  expiresInDays: number;
}

export type TrashEntityType =
  | "product"
  | "customer"
  | "supplier"
  | "sale"
  | "purchase"
  | "payment"
  | "document";

export interface TrashItem {
  id: Id;
  entity: TrashEntityType;
  entityType?: TrashEntityType;
  entity_type?: TrashEntityType;
  reference: string;
  name: string;
  deletedAt: string;
  deletedBy?: string | null;
  status?: string | null;
  total?: number | null;
  fileSize?: number | null;
  documentType?: string | null;
  minioObjectKey?: string | null;
  minioBucket?: string | null;
}

export interface DeleteImpactResult {
  canDelete: boolean;
  requiresCascadeConfirmation: boolean;
  mainEntity: string;
  entityType: string;
  entityStatus?: string | null;
  blockingRelations: string[];
  cascadeWouldDelete: string[];
  willKeep: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  warning?: string | null;
}

export interface Alert {
  id: Id;
  type: string;
  title: string;
  message: string;
  productId?: Id | null;
  designation?: string | null;
  reference?: string | null;
  currentStock?: number | null;
  minimumStock?: number | null;
  isRead: boolean;
  createdAt: string;
  product?: Product | null;
}

export interface StockMovement {
  id: Id;
  type: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string | null;
  reference?: string | null;
  createdAt: string;
  product?: Product | null;
}

export interface AuditLog {
  id: Id;
  action: string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  archivedAt?: string | null;
  _source?: 'active' | 'archive';
  user?: { id: string; email: string; fullName: string } | null;
}

export interface AuditLogPaginatedResult {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: 'active' | 'archive';
}

export interface AuditLogStats {
  activeCount: number;
  archiveCount: number;
  eligibleCount: number;
  activeEstimatedBytes: number;
  archiveEstimatedBytes: number;
  retentionMonths: number;
  archiveEnabled: boolean;
  compressExport: boolean;
  nextCutoffDate: string;
  lastArchiveDate: string | null;
}

export interface AuditRetentionSettings {
  retentionMonths: number;
  archiveEnabled: boolean;
  compressExport: boolean;
}

export interface ArchiveResult {
  archivedCount: number;
  exportedFile: string;
  exportedSize: number;
  skipped: boolean;
  reason?: string;
}

export interface DropdownOption {
  id: Id;
  category: string;
  label: string;
  value: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CreditNoteStatus = "CREATED" | "REFUNDED" | "CANCELLED";

export interface ReturnableItem {
  saleItemId: Id;
  productId: Id;
  product: { id: Id; reference: string; name: string } | null;
  quantiteSold: number;
  quantiteDejaRetournee: number;
  quantiteAnnulee: number;
  quantiteRetournable: number;
  unitPrice: number;
  tvaRate: number;
  total: number;
}

export interface ReturnableItemsResponse {
  saleId: Id;
  invoiceNumber: string;
  customer: { id: Id; name: string } | null;
  items: ReturnableItem[];
}

export interface CreditNoteItem {
  id: Id;
  creditNoteId: Id;
  saleItemId?: Id | null;
  productId: Id;
  designation: string;
  quantiteRetournee: number;
  prixUnitaireHt: number | string;
  tva: number | string;
  totalHt: number | string;
  totalTtc: number | string;
  motifLigne?: string | null;
  product?: { id: Id; reference: string; name: string } | null;
}

export interface CreditNote {
  id: Id;
  numero: string;
  saleId: Id;
  customerId?: Id | null;
  dateAvoir: string;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  totalHT: number | string;
  totalTVA: number | string;
  totalTTC: number | string;
  stampDuty: number | string;
  totalFinal: number | string;
  montantRembourse: number | string;
  motif?: string | null;
  statut: CreditNoteStatus;
  createdById?: Id | null;
  createdAt: string;
  updatedAt: string;
  sale?: { invoiceNumber: string; customerId?: Id | null } | null;
  customer?: {
    id: Id;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  createdBy?: { id: Id; fullName: string } | null;
  items: CreditNoteItem[];
  payments?: Payment[];
}

export interface DashboardReport {
  period: ReportPeriod;
  range: { from: string; to: string };
  ventes: ReportOverview['ventes'];
  achats: ReportOverview['achats'];
  stock: ReportOverview['stock'];
  topProduits: ReportTopProduct[];
  series: ReportTimeSeries[];
  pendingCustomerOrders: number;
  pendingSupplierReceipts: number;
  operationnel: { caNet: number; encaissements: number; resteAEncaisser: number; panierMoyen: number };
  financier?: {
    beneficeBrut: number;
    coutProduitsVendus: number;
    tauxMarque: number;
    tauxMargeSurCout: number;
    remisesAccordees: number;
    dataQuality: { unknownCostLines: number; estimatedCostLines: number; complete: boolean };
  };
  productsCount?: number;
  lowStockCount?: number;
  customersCount?: number;
  salesCount?: number;
  salesTotal?: number | string;
  paidTotal?: number | string;
  unpaidSales?: number;
}

export type ReportPeriod = 'today' | 'yesterday' | 'last7' | 'week' | 'last30' | 'month' | 'quarter' | 'year' | 'custom';

export interface ReportOverviewQuery {
  period?: ReportPeriod;
  dateFrom?: string;
  dateTo?: string;
  sellerId?: string;
  customerId?: string;
  productId?: string;
  categoryId?: string;
  documentType?: 'FACTURE' | 'BON_LIVRAISON';
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
}

export interface ReportFilterOption {
  id: string;
  label: string;
  secondaryLabel?: string;
  categoryId?: string;
}

export interface ReportTimeSeries {
  label: string;
  ca: number;
  achats: number;
  encaissements: number;
  depenses: number;
  benefice: number;
  margeBrute: number;
  coutVendu: number;
  ventes: number;
  achatsCount: number;
}

export interface ReportCriticalProduct {
  id: string;
  name: string;
  reference: string;
  sku: string;
  quantity: number;
  minStock: number;
  category: string | null;
  brand: string | null;
  statut: 'rupture' | 'faible';
}

export interface ReportStockCategory {
  name: string;
  purchaseValue: number;
  saleValue: number;
  count: number;
}

export interface ReportTopProduct {
  product: {
    id: string;
    name: string;
    reference: string;
    category: { name: string } | null;
  } | null;
  quantitySold: number;
  revenue: number;
}

export interface ReportProductPerformance {
  productId: string;
  product: { name: string; reference: string; category: { name: string } | null };
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  markupRate: number;
}

export interface ReportTopClient {
  customer: {
    id: string;
    name: string;
    reference: string;
  } | null;
  ca: number;
  impaye: number;
}

export interface ReportTopSupplier {
  supplier: {
    id: string;
    name: string;
  } | null;
  totalAchats: number;
  impaye: number;
}

export interface ReportOverview {
  period: ReportPeriod;
  range: { from: string; to: string };

  financier: {
    caNet: number;
    caGross: number;
    caTrend: number | null;
    encaissementsClients: number;
    impayesClients: number;
    totalAchats: number;
    achatsTrend: number | null;
    paiementsFournisseurs: number;
    impayesFournisseurs: number;
    depenses: number;
    coutProduitsVendus: number;
    margeBruteReelle: number;
    beneficeBrut: number;
    beneficeEstime: number;
    margePercent: number;
    tauxMarque: number;
    tauxMargeSurCout: number;
    remisesAccordees: number;
    dataQuality: { unknownCostLines: number; estimatedCostLines: number; complete: boolean };
    soldeCaisse: number;
    soldeBanque: number;
    soldeGlobal: number;
  };

  ventes: {
    count: number;
    prevCount: number;
    countTrend: number | null;
    panierMoyen: number;
    quantiteVendue: number;
    beneficeMoyen: number;
    devisCount: number;
    bonCommandeCount: number;
    blCount: number;
    factureCount: number;
    cancelledCount: number;
    parStatutPaiement: { paye: number; partiel: number; impaye: number };
    avoirs: { count: number; total: number; montantRembourse: number };
  };

  achats: {
    count: number;
    prevCount: number;
    countTrend: number | null;
  };

  stock: {
    valeurAchat: number;
    valeurVente: number;
    totalProduits: number;
    ruptureCount: number;
    lowStockCount: number;
    totalQuantite: number;
    mouvements: { entries: number; exits: number; total: number };
    produitsCritiques: ReportCriticalProduct[];
    parCategorie: ReportStockCategory[];
  };

  clients: { total: number };

  topProduits: ReportTopProduct[];
  topProduitsBenefice: ReportProductPerformance[];
  produitsFaibleMarge: ReportProductPerformance[];
  topClients: ReportTopClient[];
  topFournisseurs: ReportTopSupplier[];
  series: ReportTimeSeries[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SalesQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  documentType?: string;
  paymentStatus?: string;
  customerId?: string;
  payableOnly?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CustomerSaleHistoryItem {
  id: Id;
  invoiceNumber: string;
  documentType: SalesDocumentType;
  status: string;
  createdAt: string;
  itemCount: number;
  totalTtc: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  isConsolidated?: boolean;
  consolidationStatus?: "ACTIVE" | "REPLACED" | "CANCELLED" | null;
  sourceDocumentsCount?: number;
  activeConsolidation?: { id: Id; invoiceNumber: string } | null;
}

export interface CustomerSalesHistoryResponse {
  data: CustomerSaleHistoryItem[];
  pagination: CustomerSalesPagination;
  summary: {
    totalTtc: number | string;
    totalPaid: number | string;
    totalRemaining: number | string;
    unpaidCount: number;
  };
}

export interface CustomerSalesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PurchasesQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  paymentStatus?: string;
  supplierId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface StockMovementsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  productId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaymentsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  method?: string;
  customerId?: string;
  supplierId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
