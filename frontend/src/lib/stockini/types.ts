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
  tva: number | string;                 // TVA en % (défaut 19)
  purchasePrice: number | string;       // Prix d'achat HT
  purchasePriceTtc: number | string;    // Prix d'achat TTC (HT × (1 + TVA/100))
  salePrice: number | string;           // Prix de vente (TTC × 1.4)
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
  | 'ENCAISSEMENT_VENTE'
  | 'DECAISSEMENT_ACHAT'
  | 'DEPOT_MANUEL'
  | 'RETRAIT_MANUEL'
  | 'ANNULATION_VENTE'
  | 'ANNULATION_ACHAT';

export interface CaisseMovement {
  id: Id;
  type: CaisseMovementType;
  montant: number | string;
  ancienSolde: number | string;
  nouveauSolde: number | string;
  motif?: string | null;
  referenceDoc?: string | null;
  userId?: string | null;
  createdAt: string;
  user?: { id: Id; fullName: string; email: string } | null;
}

export interface CaisseBalance {
  solde: number;
  allowNegative: boolean;
}

export interface Customer {
  id: Id;
  reference: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: 'INDIVIDUAL' | 'GARAGE' | 'COMPANY';
  taxNumber?: string | null;
  creditBalance: number | string;
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
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface Sale {
  id: Id;
  invoiceNumber: string;
  total: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  documentType: SalesDocumentType;
  stockImpactDone: boolean;
  lastSalePriceImpactDone?: boolean;
  reserveStock: boolean;
  createdAt: string;
  customer?: Customer | null;
  items?: Array<{ id: Id; quantity: number }>;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface SaleItemDetail {
  id: Id;
  productId: Id;
  quantity: number;
  unitPrice: number | string;
  discountPercent?: number | string;
  finalUnitPrice?: number | string | null;
  total: number | string;
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
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  customer?: Customer | null;
  items: SaleItemDetail[];
}

export interface Purchase {
  id: Id;
  orderNumber: string;
  total: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  supplier?: Supplier | null;
  items?: Array<{ id: Id; quantity: number; receivedQuantity?: number; unitCost?: number | string }>;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface PurchaseItemDetail {
  id: Id;
  productId: Id;
  quantity: number;
  receivedQuantity: number;
  unitCost: number | string;
  total: number | string;
  product?: {
    id: Id;
    reference: string;
    name: string;
  } | null;
}

export interface PurchaseDetail {
  id: Id;
  orderNumber: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: string;
  status: string;
  createdAt: string;
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

export type SalesDocumentType = 'DEVIS' | 'BON_COMMANDE' | 'BON_LIVRAISON' | 'FACTURE' | 'AVOIR';
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED';
export type DocumentStatus = 'GENERATED' | 'SENT' | 'DELETED';

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

export type TrashEntityType = 'product' | 'customer' | 'supplier' | 'sale' | 'purchase' | 'payment';

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
  createdAt: string;
  user?: { email: string; fullName: string } | null;
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

export type CreditNoteStatus = 'CREATED' | 'REFUNDED' | 'CANCELLED';

export interface ReturnableItem {
  saleItemId: Id;
  productId: Id;
  product: { id: Id; reference: string; name: string } | null;
  quantiteSold: number;
  quantiteDejaRetournee: number;
  quantiteRetournable: number;
  unitPrice: number;
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
  montantRembourse: number | string;
  motif?: string | null;
  statut: CreditNoteStatus;
  createdById?: Id | null;
  createdAt: string;
  updatedAt: string;
  sale?: { invoiceNumber: string; customerId?: Id | null } | null;
  customer?: { id: Id; name: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  createdBy?: { id: Id; fullName: string } | null;
  items: CreditNoteItem[];
  payments?: Payment[];
}

export interface DashboardReport {
  productsCount: number;
  lowStockCount: number;
  customersCount: number;
  salesCount: number;
  salesTotal: number | string;
  paidTotal: number | string;
  unpaidSales: number;
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
}
