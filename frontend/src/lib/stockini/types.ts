export type Id = string;

export interface Lookup {
  id: Id;
  name: string;
}

export interface Product {
  id: Id;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  purchasePrice: number | string;
  salePrice: number | string;
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
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: 'INDIVIDUAL' | 'GARAGE' | 'COMPANY';
  taxNumber?: string | null;
  creditBalance: number | string;
}

export interface Supplier {
  id: Id;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
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
}

export interface Payment {
  id: Id;
  type: string;
  method: string;
  amount: number | string;
  createdAt: string;
  customer?: Customer | null;
  supplier?: Supplier | null;
  sale?: Sale | null;
  purchase?: Purchase | null;
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

export interface DashboardReport {
  productsCount: number;
  lowStockCount: number;
  customersCount: number;
  salesCount: number;
  salesTotal: number | string;
  paidTotal: number | string;
  unpaidSales: number;
}
