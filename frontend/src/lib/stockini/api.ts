import { api } from '@/lib/api';
import type {
  Alert,
  AuditLog,
  Customer,
  DashboardReport,
  Payment,
  Product,
  Purchase,
  Sale,
  StockMovement,
  Supplier,
  DropdownOption,
} from './types';

type ProductUpdatePayload = Omit<Partial<Product>, 'quantity'> & { categoryId?: string };

export const stockiniApi = {
  dashboard: () => api.get<DashboardReport>('/reports/dashboard').then((r) => r.data),
  stockValue: () => api.get<{ purchaseValue: number; saleValue: number }>('/reports/stock-value').then((r) => r.data),
  topSelling: () => api.get('/reports/top-selling').then((r) => r.data),
  products: (search?: string) => api.get<Product[]>('/products', { params: search ? { search } : undefined }).then((r) => r.data),
  product: (id: string) => api.get<Product>(`/products/${id}`).then((r) => r.data),
  createProduct: (data: Omit<Partial<Product>, 'id' | 'category' | 'brand' | 'supplier'> & { categoryId: string; brandId: string; supplierId?: string }) =>
    api.post<Product>('/products', data).then((r) => r.data),
  updateProduct: (id: string, data: ProductUpdatePayload) => {
    const productData = { ...data };
    delete (productData as ProductUpdatePayload & { quantity?: unknown }).quantity;

    return api.patch<Product>(`/products/${id}`, productData).then((r) => r.data);
  },
  deleteProduct: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  customers: () => api.get<Customer[]>('/customers').then((r) => r.data),
  customer: (id: string) => api.get<Customer>(`/customers/${id}`).then((r) => r.data),
  updateCustomer: (id: string, data: Partial<Customer>) =>
    api.patch<Customer>(`/customers/${id}`, data).then((r) => r.data),
  suppliers: () => api.get<Supplier[]>('/suppliers').then((r) => r.data),
  createSupplier: (data: Partial<Supplier>) => api.post<Supplier>('/suppliers', data).then((r) => r.data),
  updateSupplier: (id: string, data: Partial<Supplier>) => api.patch<Supplier>(`/suppliers/${id}`, data).then((r) => r.data),
  deleteSupplier: (id: string) => api.delete(`/suppliers/${id}`).then((r) => r.data),
  sales: () => api.get<Sale[]>('/sales').then((r) => r.data),
  createSale: (data: unknown) => api.post<Sale>('/sales', data).then((r) => r.data),
  updateSale: (id: string, data: Partial<Sale>) => api.patch<Sale>(`/sales/${id}`, data).then((r) => r.data),
  deleteSale: (id: string) => api.delete(`/sales/${id}`).then((r) => r.data),
  purchases: () => api.get<Purchase[]>('/purchases').then((r) => r.data),
  createPurchase: (data: unknown) => api.post<Purchase>('/purchases', data).then((r) => r.data),
  updatePurchase: (id: string, data: Partial<Purchase>) => api.patch<Purchase>(`/purchases/${id}`, data).then((r) => r.data),
  deletePurchase: (id: string) => api.delete(`/purchases/${id}`).then((r) => r.data),
  payments: () => api.get<Payment[]>('/payments').then((r) => r.data),
  createPayment: (data: Partial<Payment>) => api.post<Payment>('/payments', data).then((r) => r.data),
  updatePayment: (id: string, data: Partial<Payment>) => api.patch<Payment>(`/payments/${id}`, data).then((r) => r.data),
  deletePayment: (id: string) => api.delete(`/payments/${id}`).then((r) => r.data),
  alerts: () => api.get<Alert[]>('/alerts').then((r) => r.data),
  createAlert: (data: Partial<Alert>) => api.post<Alert>('/alerts', data).then((r) => r.data),
  updateAlert: (id: string, data: Partial<Alert>) => api.patch<Alert>(`/alerts/${id}`, data).then((r) => r.data),
  deleteAlert: (id: string) => api.delete(`/alerts/${id}`).then((r) => r.data),
  movements: () => api.get<StockMovement[]>('/stock/movements').then((r) => r.data),
  stockEntry: (data: { productId: string; quantity: number; reason?: string }) =>
    api.post<StockMovement>('/stock/entry', data).then((r) => r.data),
  stockExit: (data: { productId: string; quantity: number; reason?: string }) =>
    api.post<StockMovement>('/stock/exit', data).then((r) => r.data),
  stockAdjustment: (data: { productId: string; newQuantity: number; reason?: string }) =>
    api.post<StockMovement>('/stock/adjustment', data).then((r) => r.data),
  settings: () => api.get<Array<{ key: string; value: string }>>('/settings').then((r) => r.data),
  createSetting: (data: { key: string; value: string }) => api.post('/settings', data).then((r) => r.data),
  updateSetting: (key: string, data: { value: string }) => api.patch(`/settings/${key}`, data).then((r) => r.data),
  deleteSetting: (key: string) => api.delete(`/settings/${key}`).then((r) => r.data),
  dropdownCategories: () => api.get<Array<{ category: string; _count: { _all: number } }>>('/settings/dropdown-options/categories').then((r) => r.data),
  dropdownOptions: () => api.get<DropdownOption[]>('/settings/dropdown-options').then((r) => r.data),
  dropdownOptionsByCategory: (category: string) => api.get<DropdownOption[]>(`/settings/dropdown-options/${category}`).then((r) => r.data),
  createDropdownOption: (data: Partial<DropdownOption>) => api.post<DropdownOption>('/settings/dropdown-options', data).then((r) => r.data),
  updateDropdownOption: (id: string, data: Partial<DropdownOption>) => api.put<DropdownOption>(`/settings/dropdown-options/${id}`, data).then((r) => r.data),
  toggleDropdownOption: (id: string, active: boolean) => api.patch<DropdownOption>(`/settings/dropdown-options/${id}/active`, { active }).then((r) => r.data),
  deleteDropdownOption: (id: string) => api.delete(`/settings/dropdown-options/${id}`).then((r) => r.data),
  auditLogs: () => api.get<AuditLog[]>('/audit-logs').then((r) => r.data),
  categories: () => api.get<Array<{ id: string; name: string; description?: string }>>('/categories').then((r) => r.data),
  createCategory: (data: { name: string; description?: string }) => api.post('/categories', data).then((r) => r.data),
  updateCategory: (id: string, data: { name?: string; description?: string }) => api.patch(`/categories/${id}`, data).then((r) => r.data),
  deleteCategory: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),
  brands: () => api.get<Array<{ id: string; name: string }>>('/brands').then((r) => r.data),
  createBrand: (data: { name: string }) => api.post('/brands', data).then((r) => r.data),
  updateBrand: (id: string, data: { name?: string }) => api.patch(`/brands/${id}`, data).then((r) => r.data),
  deleteBrand: (id: string) => api.delete(`/brands/${id}`).then((r) => r.data),
};
