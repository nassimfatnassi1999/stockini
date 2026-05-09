export type Id = string;

export interface Lookup {
  id: Id;
  name: string;
}

export interface Product {
  id: Id;
  reference: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  purchasePrice: number | string;       // Prix d'achat HT
  purchasePriceTtc: number | string;    // Prix d'achat TTC (HT × 1.19)
  salePrice: number | string;           // Prix de vente (TTC × 1.4)
  lastSellingPrice?: number | string | null;
  quantity: number;
  minStock: number;
  location?: string | null;
  isActive: boolean;
  category?: Lookup;
  brand?: Lookup;
  supplier?: Lookup | null;
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
  items?: Array<{ id: Id; quantity: number; receivedQuantity?: number }>;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface Payment {
  id: Id;
  reference: string;
  type: string;
  method: string;
  amount: number | string;
  createdAt: string;
  customer?: Customer | null;
  supplier?: Supplier | null;
  sale?: Sale | null;
  purchase?: Purchase | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
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

export interface DashboardReport {
  productsCount: number;
  lowStockCount: number;
  customersCount: number;
  salesCount: number;
  salesTotal: number | string;
  paidTotal: number | string;
  unpaidSales: number;
}
