'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Boxes, Check, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, initials, money, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Alert, Customer, DropdownOption, Payment, Product, Purchase, Sale, StockMovement, Supplier } from '@/lib/stockini/types';
import type { AuditLog } from '@/lib/stockini/types';

function StatCard({ icon: Icon, label, value, tone = 'primary' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone?: 'primary' | 'accent' | 'green' | 'red';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className="mt-1 truncate font-mono text-xl font-bold text-text-primary">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="app-page-title">{title}</h1>
        <p className="app-page-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Rechercher..."
        className="h-9 pl-9 text-sm"
      />
    </div>
  );
}

type FieldConfig = {
  name: string;
  label: string;
  readOnly?: boolean;
  required?: boolean;
  type?: 'text' | 'number' | 'email' | 'select' | 'checkbox';
  options?: Array<{ value: string; label: string }>;
};

const FALLBACK_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  customer_types: [
    { value: 'INDIVIDUAL', label: 'Particulier' },
    { value: 'COMPANY', label: 'Entreprise' },
    { value: 'GARAGE', label: 'Garage' },
  ],
  payment_methods: [
    { value: 'CASH', label: 'Espèces' },
    { value: 'CARD', label: 'Carte bancaire' },
    { value: 'BANK_TRANSFER', label: 'Virement' },
    { value: 'CHECK', label: 'Chèque' },
    { value: 'CREDIT', label: 'Crédit' },
  ],
  payment_types: [
    { value: 'CUSTOMER_PAYMENT', label: 'Client' },
    { value: 'SUPPLIER_PAYMENT', label: 'Fournisseur' },
  ],
  stock_operation_types: [
    { value: 'ENTRY', label: 'Entrée' },
    { value: 'EXIT', label: 'Sortie' },
    { value: 'ADJUSTMENT', label: 'Correction inventaire' },
  ],
  stock_movement_reasons: [
    { value: 'entry', label: 'entry' },
    { value: 'sale', label: 'sale' },
    { value: 'correction', label: 'correction' },
    { value: 'retour', label: 'retour' },
  ],
  alert_types: ['LOW_STOCK', 'OUT_OF_STOCK', 'UNPAID_INVOICE', 'PURCHASE_DELAY', 'SYSTEM'].map((value) => ({ value, label: statusLabel(value) })),
  stock_locations: [
    { value: 'A1-01', label: 'A1-01' },
    { value: 'B1-01', label: 'B1-01' },
    { value: 'B2-04', label: 'B2-04' },
  ],
};

function useDropdownOptions(category: string) {
  const query = useQuery({
    queryKey: ['stockini-dropdown-options', category],
    queryFn: () => stockiniApi.dropdownOptionsByCategory(category),
  });
  const options = (query.data ?? []).map((option) => ({ value: option.value, label: option.label }));
  return options.length > 0 ? options : (FALLBACK_OPTIONS[category] ?? []);
}

function emptyForm(fields: FieldConfig[]) {
  return fields.reduce<Record<string, string | boolean>>((acc, field) => {
    acc[field.name] = field.type === 'checkbox' ? false : '';
    return acc;
  }, {});
}

function cleanPayload(form: Record<string, string | boolean>, fields: FieldConfig[]) {
  return fields.reduce<Record<string, string | number | boolean | null>>((acc, field) => {
    const value = form[field.name];
    if (field.type === 'checkbox') {
      acc[field.name] = Boolean(value);
      return acc;
    }
    if (field.readOnly) return acc;
    const text = String(value ?? '').trim();
    if (!text && !field.required) return acc;
    acc[field.name] = field.type === 'number' ? Number(text || 0) : text;
    return acc;
  }, {});
}

function CrudModal({
  fields,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  title,
}: {
  fields: FieldConfig[];
  form: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className={field.type === 'checkbox' ? 'flex items-center gap-2 self-end py-2' : 'space-y-1.5'}>
              {field.type === 'checkbox' ? (
                <>
                  <input
                    id={`field-${field.name}`}
                    type="checkbox"
                    checked={Boolean(form[field.name])}
                    onChange={(event) => onChange(field.name, event.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={`field-${field.name}`}>{field.label}</Label>
                </>
              ) : (
                <>
                  <Label htmlFor={`field-${field.name}`}>{field.label}{field.required ? ' *' : ''}</Label>
                  {field.type === 'select' ? (
                    <select
                      id={`field-${field.name}`}
                      value={String(form[field.name] ?? '')}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      required={field.required}
                      className="app-select"
                    >
                      <option value="">Sélectionner</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <Input
                      id={`field-${field.name}`}
                      type={field.type ?? 'text'}
                      min={field.type === 'number' ? 0 : undefined}
                      step={field.type === 'number' ? '0.001' : undefined}
                      value={String(form[field.name] ?? '')}
                      placeholder={field.readOnly ? 'Générée automatiquement' : undefined}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      readOnly={field.readOnly}
                      required={field.required}
                    />
                  )}
                </>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              <Check size={14} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete, deleting }: { onEdit?: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button type="button" size="action" variant="actionEdit" onClick={onEdit} title="Modifier">
          <Pencil size={16} />
        </Button>
      )}
      <Button type="button" size="action" variant="actionDelete" onClick={onDelete} disabled={deleting} title="Supprimer">
        <Trash2 size={16} />
      </Button>
    </div>
  );
}

function numberValue(value: number | string | boolean | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCalculatedAmount(value: number) {
  return value.toFixed(2);
}

function StateRows({ loading, error, empty, colSpan }: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  colSpan: number;
}) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Chargement...</TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-red-600">Impossible de charger les données.</TableCell>
      </TableRow>
    );
  }
  if (empty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Aucune donnée trouvée.</TableCell>
      </TableRow>
    );
  }
  return null;
}

function StockBadge({ product }: { product: Product }) {
  if (product.quantity <= 0) return <Badge className="border-red-200 bg-red-50 text-red-700">rupture</Badge>;
  if (product.quantity <= product.minStock) return <Badge className="border-amber-200 bg-amber-50 text-amber-700">stock bas</Badge>;
  return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">disponible</Badge>;
}

export function StockiniDashboardPage() {
  const dashboard = useQuery({ queryKey: ['stockini-dashboard'], queryFn: stockiniApi.dashboard });
  const stockValue = useQuery({ queryKey: ['stockini-stock-value'], queryFn: stockiniApi.stockValue });
  const products = useQuery({ queryKey: ['stockini-products-preview'], queryFn: () => stockiniApi.products() });
  const alerts = useQuery({ queryKey: ['stockini-alerts-preview'], queryFn: stockiniApi.alerts });

  const lowProducts = useMemo(
    () => (products.data ?? []).filter((product) => product.quantity <= product.minStock).slice(0, 6),
    [products.data],
  );

  return (
    <>
      <PageHeader title="Dashboard Stockini" subtitle="Vue opérationnelle des pièces, ventes, alertes et valeur de stock." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Boxes} label="Produits actifs" value={dashboard.data?.productsCount ?? '-'} />
        <StatCard icon={AlertTriangle} label="Sous seuil" value={dashboard.data?.lowStockCount ?? '-'} tone="accent" />
        <StatCard icon={Users} label="Clients" value={dashboard.data?.customersCount ?? '-'} />
        <StatCard icon={Banknote} label="Ventes" value={money(dashboard.data?.salesTotal)} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
            <CardTitle>Stock critique</CardTitle>
            <Badge variant="muted">{money(stockValue.data?.saleValue ?? 0)} valeur vente</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={products.isLoading} error={products.error} empty={lowProducts.length === 0} colSpan={5} />
                {lowProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono font-semibold">{product.reference ?? product.sku}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="text-text-secondary">{product.category?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono">{product.quantity}</TableCell>
                    <TableCell><StockBadge product={product} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="p-4">
            <CardTitle>Alertes récentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {alerts.isLoading && <p className="text-sm text-text-secondary">Chargement...</p>}
            {alerts.error && <p className="text-sm text-red-600">Alertes indisponibles.</p>}
            {(alerts.data ?? []).slice(0, 6).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-text-primary">{alert.title}</p>
                  <Badge className={alert.isRead ? 'bg-muted text-text-secondary' : 'bg-accent text-white'}>
                    {alert.isRead ? 'lu' : 'nouveau'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-secondary">{alert.message}</p>
              </div>
            ))}
            {!alerts.isLoading && !alerts.error && (alerts.data ?? []).length === 0 && (
              <p className="text-sm text-text-secondary">Aucune alerte active.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<Record<string, string | boolean>>({
    name: '',
    categoryId: '',
    brandId: '',
    supplierId: '',
    purchasePrice: '',
    salePrice: '',
    quantity: '',
    minStock: '',
    location: '',
  });
  const query = useQuery({ queryKey: ['stockini-products', search], queryFn: () => stockiniApi.products(search) });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const locationOptions = useDropdownOptions('stock_locations');
  const data = query.data ?? [];
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'name', label: 'Désignation', required: true },
    { name: 'categoryId', label: 'Catégorie', type: 'select', required: true, options: (categories.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'brandId', label: 'Marque', type: 'select', required: true, options: (brands.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'supplierId', label: 'Fournisseur', type: 'select', options: (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'purchasePrice', label: 'Prix achat', type: 'number', required: true },
    { name: 'salePrice', label: 'Prix vente', type: 'number', required: true },
    { name: 'quantity', label: 'Quantité initiale', type: 'number', required: true },
    { name: 'minStock', label: 'Seuil minimum', type: 'number', required: true },
    { name: 'location', label: 'Emplacement', type: 'select', options: locationOptions },
  ];
  const createMutation = useMutation({
    mutationFn: () => stockiniApi.createProduct(cleanPayload(productForm, fields) as Parameters<typeof stockiniApi.createProduct>[0]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setProductForm(emptyForm(fields));
      toast.success('Produit créé');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Produit supprimé');
    },
  });

  return (
    <>
      <PageHeader title="Produits" subtitle="Catalogue connecté au backend: catégories, marques, fournisseurs et seuils." />
      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4">
          <CardTitle>Catalogue pièces</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchBox value={search} onChange={setSearch} />
            <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              Nouveau
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Marque</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Achat</TableHead>
                <TableHead className="text-right">Vente</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={query.isLoading} error={query.error} empty={data.length === 0} colSpan={9} />
              {data.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono font-semibold">{product.reference ?? product.sku}</TableCell>
                  <TableCell>
                    <Link
                      href={`/produits/${product.id}`}
                      className="text-left font-medium text-primary underline-offset-4 transition-colors hover:text-primary-dark hover:underline"
                    >
                      {product.name}
                    </Link>
                    <div className="text-xs text-text-muted">{product.location ?? product.barcode ?? '-'}</div>
                  </TableCell>
                  <TableCell>{product.category?.name ?? '-'}</TableCell>
                  <TableCell>{product.brand?.name ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono">{product.quantity} / {product.minStock}</TableCell>
                  <TableCell className="text-right font-mono">{money(product.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(product.salePrice)}</TableCell>
                  <TableCell><StockBadge product={product} /></TableCell>
                  <TableCell>
                    <RowActions onDelete={() => deleteMutation.mutate(product.id)} deleting={deleteMutation.isPending} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {modalOpen && (
        <CrudModal
          title="Nouveau produit"
          fields={fields}
          form={productForm}
          onChange={(name, value) => setProductForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}
    </>
  );
}

export function CustomersPage() {
  const query = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const data = query.data ?? [];
  return (
    <SimpleTable
      title="Clients"
      subtitle="Clients particuliers, garages et sociétés issus du backend."
      loading={query.isLoading}
      error={query.error}
      headers={['Référence', 'Client', 'Type', 'Téléphone', 'Email', 'Crédit']}
      rows={data.map((customer: Customer) => [
        <span key="reference" className="font-mono font-semibold">{customer.reference}</span>,
        <Identity key="name" name={customer.name} />,
        statusLabel(customer.type),
        customer.phone ?? '-',
        customer.email ?? '-',
        money(customer.creditBalance),
      ])}
    />
  );
}

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'name', label: 'Fournisseur', required: true },
    { name: 'contactPerson', label: 'Contact' },
    { name: 'phone', label: 'Téléphone' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'address', label: 'Adresse' },
    { name: 'taxNumber', label: 'Matricule fiscal' },
    { name: 'paymentTerms', label: 'Conditions' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const data = query.data ?? [];
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Supplier>;
      return editing ? stockiniApi.updateSupplier(editing.id, payload) : stockiniApi.createSupplier(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Fournisseur enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      toast.success('Fournisseur supprimé');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Fournisseurs" subtitle="Contacts, conditions de paiement et coordonnées fournisseurs." />
        <Button type="button" size="sm" onClick={() => { setEditing({} as Supplier); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Référence', 'Fournisseur', 'Contact', 'Téléphone', 'Email', 'Conditions', 'Actions']}
        rows={data.map((supplier: Supplier) => [
          <span key="reference" className="font-mono font-semibold">{supplier.reference}</span>,
          <Identity key="name" name={supplier.name} />,
          supplier.contactPerson ?? '-',
          supplier.phone ?? '-',
          supplier.email ?? '-',
          supplier.paymentTerms ?? '-',
          <RowActions
            key="actions"
            onEdit={() => {
              setEditing(supplier);
              setForm({
                referencePreview: supplier.reference ?? '',
                name: supplier.name,
                contactPerson: supplier.contactPerson ?? '',
                phone: supplier.phone ?? '',
                email: supplier.email ?? '',
                address: supplier.address ?? '',
                taxNumber: supplier.taxNumber ?? '',
                paymentTerms: supplier.paymentTerms ?? '',
              });
            }}
            onDelete={() => deleteMutation.mutate(supplier.id)}
            deleting={deleteMutation.isPending}
          />,
        ])}
      />
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier fournisseur' : 'Nouveau fournisseur'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </>
  );
}

export function SalesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const customers = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const paymentMethodOptions = useDropdownOptions('payment_methods');
  const discountOptions = [0, 5, 10, 15, 20, 25, 30].map((value) => ({ value: String(value), label: `${value}%` }));
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'N° Facture', readOnly: true },
    { name: 'customerId', label: 'Client', type: 'select', required: true, options: (customers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité', type: 'number', required: true },
    { name: 'discountPercent', label: 'Remise', type: 'select', required: true, options: discountOptions },
    { name: 'paidAmount', label: 'Montant payé', type: 'number', readOnly: true },
    { name: 'paymentMethod', label: 'Méthode', type: 'select', required: true, options: paymentMethodOptions },
  ];
  const initialSaleForm = () => ({ ...emptyForm(fields), discountPercent: '0', paidAmount: '0.00' });
  const [form, setForm] = useState<Record<string, string | boolean>>(initialSaleForm);
  const query = useQuery({ queryKey: ['stockini-sales'], queryFn: stockiniApi.sales });
  const data = query.data ?? [];

  const getSaleCalculation = (nextForm: Record<string, string | boolean>) => {
    const product = (products.data ?? []).find((item) => item.id === nextForm.productId);
    const unitPrice = numberValue(product?.salePrice);
    const quantity = numberValue(nextForm.quantity);
    const discountPercent = numberValue(nextForm.discountPercent);
    const grossTotal = unitPrice * quantity;
    const discountAmount = grossTotal * discountPercent / 100;
    const paidAmount = grossTotal - discountAmount;

    return { discountAmount, discountPercent, grossTotal, paidAmount, product, quantity };
  };

  const updateSaleForm = (name: string, value: string | boolean) => {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (['productId', 'quantity', 'discountPercent'].includes(name)) {
        const { paidAmount } = getSaleCalculation(next);
        next.paidAmount = formatCalculatedAmount(paidAmount);
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const calculation = getSaleCalculation(form);
      return stockiniApi.createSale({
        customerId: payload.customerId,
        discount: Number(calculation.discountAmount.toFixed(3)),
        paidAmount: Number(calculation.paidAmount.toFixed(3)),
        paymentMethod: payload.paymentMethod,
        items: [{ productId: payload.productId, quantity: payload.quantity }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(initialSaleForm());
      toast.success('Vente créée');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      toast.success('Vente supprimée');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Ventes" subtitle="Factures, paiements et statuts de vente." />
        <Button type="button" size="sm" onClick={() => { setForm(initialSaleForm()); setModalOpen(true); }}>
          <Plus size={14} />
          Nouvelle
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Facture', 'Client', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((sale: Sale) => [
          <span key="invoice" className="font-mono font-semibold">{sale.invoiceNumber}</span>,
          sale.customer?.name ?? 'Client comptoir',
          dateTime(sale.createdAt),
          sale.items?.length ?? 0,
          money(sale.total),
          statusLabel(sale.paymentStatus),
          <Status key="status" value={sale.status} />,
          <RowActions key="actions" onDelete={() => deleteMutation.mutate(sale.id)} deleting={deleteMutation.isPending} />,
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouvelle vente"
          fields={fields}
          form={form}
          onChange={updateSaleForm}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const calculation = getSaleCalculation(form);
            const expectedPaidAmount = formatCalculatedAmount(calculation.paidAmount);
            if (!form.customerId) {
              toast.error('Veuillez sélectionner un client.');
              return;
            }
            if (!calculation.product) {
              toast.error('Veuillez sélectionner un produit.');
              return;
            }
            if (calculation.quantity <= 0) {
              toast.error('La quantité doit être supérieure à 0.');
              return;
            }
            if (calculation.discountPercent > 30) {
              window.alert('La remise ne peut pas dépasser 30%.');
              return;
            }
            if (String(form.paidAmount) !== expectedPaidAmount) {
              toast.error('Le montant payé calculé est incorrect.');
              return;
            }
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}
    </>
  );
}

export function PurchasesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'N° Commande', readOnly: true },
    { name: 'supplierId', label: 'Fournisseur', type: 'select', required: true, options: (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité', type: 'number', required: true },
    { name: 'unitCost', label: 'Coût unitaire', type: 'number', required: true },
    { name: 'paidAmount', label: 'Montant payé', type: 'number' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-purchases'], queryFn: stockiniApi.purchases });
  const data = query.data ?? [];
  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return stockiniApi.createPurchase({
        supplierId: payload.supplierId,
        paidAmount: payload.paidAmount || 0,
        items: [{ productId: payload.productId, quantity: payload.quantity, unitCost: payload.unitCost }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Achat créé');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deletePurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      toast.success('Achat supprimé');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Achats" subtitle="Bons de commande et réceptions fournisseurs." />
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Commande', 'Fournisseur', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((purchase: Purchase) => [
          <span key="order" className="font-mono font-semibold">{purchase.orderNumber}</span>,
          purchase.supplier?.name ?? '-',
          dateTime(purchase.createdAt),
          purchase.items?.length ?? 0,
          money(purchase.total),
          statusLabel(purchase.paymentStatus),
          <Status key="status" value={purchase.status} />,
          <RowActions key="actions" onDelete={() => deleteMutation.mutate(purchase.id)} deleting={deleteMutation.isPending} />,
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouvel achat"
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}
    </>
  );
}

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Payment | null>(null);
  const paymentTypeOptions = useDropdownOptions('payment_types');
  const paymentMethodOptions = useDropdownOptions('payment_methods');
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'type', label: 'Type', type: 'select', required: true, options: paymentTypeOptions },
    { name: 'method', label: 'Méthode', type: 'select', required: true, options: paymentMethodOptions },
    { name: 'amount', label: 'Montant', type: 'number', required: true },
    { name: 'note', label: 'Note' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-payments'], queryFn: stockiniApi.payments });
  const data = query.data ?? [];
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Payment>;
      return editing?.id ? stockiniApi.updatePayment(editing.id, payload) : stockiniApi.createPayment(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Paiement enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deletePayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      toast.success('Paiement supprimé');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Paiements" subtitle="Encaissements clients et paiements fournisseurs." />
        <Button type="button" size="sm" onClick={() => { setEditing({} as Payment); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Référence', 'Date', 'Type', 'Méthode', 'Tiers', 'Montant', 'Actions']}
        rows={data.map((payment: Payment) => [
          <span key="reference" className="font-mono font-semibold">{payment.reference}</span>,
          dateTime(payment.createdAt),
          statusLabel(payment.type),
          statusLabel(payment.method),
          payment.customer?.name ?? payment.supplier?.name ?? '-',
          money(payment.amount),
          <RowActions
            key="actions"
            onEdit={() => {
              setEditing(payment);
          setForm({ referencePreview: payment.reference ?? '', type: payment.type, method: payment.method, amount: String(payment.amount), note: '' });
            }}
            onDelete={() => deleteMutation.mutate(payment.id)}
            deleting={deleteMutation.isPending}
          />,
        ])}
      />
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier paiement' : 'Nouveau paiement'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </>
  );
}

export function StockMovementsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const operationOptions = useDropdownOptions('stock_operation_types');
  const reasonOptions = useDropdownOptions('stock_movement_reasons');
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'movementKind', label: 'Opération', type: 'select', required: true, options: operationOptions },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité / nouveau stock', type: 'number', required: true },
    { name: 'reason', label: 'Motif', type: 'select', options: reasonOptions },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-movements'], queryFn: stockiniApi.movements });
  const data = query.data ?? [];
  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const common = {
        productId: String(payload.productId),
        reason: payload.reason ? String(payload.reason) : undefined,
      };
      if (payload.movementKind === 'ADJUSTMENT') {
        return stockiniApi.stockAdjustment({ ...common, newQuantity: Number(payload.quantity) });
      }
      if (payload.movementKind === 'EXIT') {
        return stockiniApi.stockExit({ ...common, quantity: Number(payload.quantity) });
      }
      return stockiniApi.stockEntry({ ...common, quantity: Number(payload.quantity) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Mouvement stock enregistré');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Stock" subtitle="Historique des entrées, sorties, corrections et réceptions." />
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Mouvement
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Date', 'Produit', 'Type', 'Quantité', 'Avant', 'Après', 'Référence']}
        rows={data.map((movement: StockMovement) => [
          dateTime(movement.createdAt),
          movement.product?.name ?? '-',
          statusLabel(movement.type),
          movement.quantity,
          movement.previousQuantity,
          movement.newQuantity,
          movement.reference ?? '-',
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouveau mouvement stock"
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}
    </>
  );
}

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Alert | null>(null);
  const alertTypeOptions = useDropdownOptions('alert_types');
  const fields: FieldConfig[] = [
    { name: 'type', label: 'Type', type: 'select', required: true, options: alertTypeOptions },
    { name: 'title', label: 'Titre', required: true },
    { name: 'message', label: 'Message', required: true },
    { name: 'isRead', label: 'Lu', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-alerts'], queryFn: stockiniApi.alerts });
  const data = query.data ?? [];
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Alert>;
      return editing?.id ? stockiniApi.updateAlert(editing.id, payload) : stockiniApi.createAlert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Alerte enregistrée');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      toast.success('Alerte supprimée');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Alertes" subtitle="Alertes de stock, factures impayées, retards achats et système." />
        <Button type="button" size="sm" onClick={() => { setEditing({} as Alert); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Date', 'Type', 'Titre', 'Message', 'Statut', 'Actions']}
        rows={data.map((alert: Alert) => [
          dateTime(alert.createdAt),
          statusLabel(alert.type),
          alert.title,
          alert.message,
          <Status key="read" value={alert.isRead ? 'READ' : 'OPEN'} />,
          <RowActions
            key="actions"
            onEdit={() => {
              setEditing(alert);
              setForm({ type: alert.type, title: alert.title, message: alert.message, isRead: alert.isRead });
            }}
            onDelete={() => deleteMutation.mutate(alert.id)}
            deleting={deleteMutation.isPending}
          />,
        ])}
      />
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier alerte' : 'Nouvelle alerte'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </>
  );
}

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['stockini-settings'], queryFn: stockiniApi.settings });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const dropdownOptions = useQuery({ queryKey: ['stockini-dropdown-options'], queryFn: stockiniApi.dropdownOptions });
  return (
    <>
      <PageHeader title="Paramètres Stockini" subtitle="Référentiels backend, catégories, marques et listes déroulantes." />
      <div className="mb-4">
        <DropdownOptionsManager loading={dropdownOptions.isLoading} options={dropdownOptions.data ?? []} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <EditableMiniList
          title="Paramètres"
          queryKey="stockini-settings"
          loading={settings.isLoading}
          items={(settings.data ?? []).map((item) => ({ key: item.key, value: item.value }))}
          fields={[{ name: 'key', label: 'Clé', required: true }, { name: 'value', label: 'Valeur', required: true }]}
          saveItem={(item, editing) => editing?.key ? stockiniApi.updateSetting(editing.key, { value: item.value }) : stockiniApi.createSetting({ key: item.key, value: item.value })}
          deleteItem={(item) => stockiniApi.deleteSetting(item.key)}
        />
        <EditableMiniList
          title="Catégories"
          queryKey="stockini-categories"
          loading={categories.isLoading}
          items={categories.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }, { name: 'description', label: 'Description' }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateCategory(editing.id, item) : stockiniApi.createCategory({ name: item.name, description: item.description })}
          deleteItem={(item) => stockiniApi.deleteCategory(item.id)}
        />
        <EditableMiniList
          title="Marques"
          queryKey="stockini-brands"
          loading={brands.isLoading}
          items={brands.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateBrand(editing.id, item) : stockiniApi.createBrand({ name: item.name })}
          deleteItem={(item) => stockiniApi.deleteBrand(item.id)}
        />
      </div>
    </>
  );
}

function DropdownOptionsManager({ loading, options }: { loading: boolean; options: DropdownOption[] }) {
  const queryClient = useQueryClient();
  const categories = Array.from(new Set([
    'customer_types',
    'payment_methods',
    'payment_types',
    'stock_operation_types',
    'stock_movement_reasons',
    'sale_statuses',
    'purchase_statuses',
    'payment_statuses',
    'report_types',
    'alert_types',
    'units',
    'stock_locations',
    ...options.map((option) => option.category),
  ])).sort();
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? 'customer_types');
  const [editing, setEditing] = useState<DropdownOption | null>(null);
  const fields: FieldConfig[] = [
    { name: 'category', label: 'Catégorie', required: true },
    { name: 'label', label: 'Libellé', required: true },
    { name: 'value', label: 'Valeur', required: true },
    { name: 'sortOrder', label: 'Ordre', type: 'number' },
    { name: 'active', label: 'Actif', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
  const visibleOptions = options.filter((option) => option.category === selectedCategory);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options'] });
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options', selectedCategory] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return editing?.id
        ? stockiniApi.updateDropdownOption(editing.id, payload)
        : stockiniApi.createDropdownOption(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setForm({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
      toast.success('Option enregistrée');
    },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => stockiniApi.toggleDropdownOption(id, active),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteDropdownOption,
    onSuccess: () => {
      invalidate();
      toast.success('Option supprimée');
    },
    onError: () => toast.error("Option utilisée: désactivez-la au lieu de la supprimer."),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4">
        <div>
          <CardTitle>Listes déroulantes</CardTitle>
          <p className="mt-1 text-sm text-text-secondary">Options actives triées par ordre puis libellé dans les formulaires.</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing({} as DropdownOption);
            setForm({ category: selectedCategory, label: '', value: '', sortOrder: String(visibleOptions.length + 1), active: true });
          }}
        >
          <Plus size={14} />
          Ajouter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${category === selectedCategory ? 'bg-primary/10 font-semibold text-primary' : 'text-text-secondary hover:bg-muted'}`}
            >
              <span>{category}</span>
              <span className="font-mono text-xs">{options.filter((option) => option.category === category).length}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Valeur</TableHead>
                <TableHead>Ordre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={loading} error={null} empty={visibleOptions.length === 0} colSpan={5} />
              {visibleOptions.map((option) => (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.label}</TableCell>
                  <TableCell className="font-mono text-xs">{option.value}</TableCell>
                  <TableCell className="font-mono">{option.sortOrder}</TableCell>
                  <TableCell><Status value={option.active ? 'ACTIVE' : 'DISABLED'} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: option.id, active: !option.active })}>
                        {option.active ? 'Désactiver' : 'Activer'}
                      </Button>
                      <RowActions
                        onEdit={() => {
                          setEditing(option);
                          setForm({ category: option.category, label: option.label, value: option.value, sortOrder: String(option.sortOrder), active: option.active });
                        }}
                        onDelete={() => {
                          if (window.confirm('Supprimer cette option ?')) {
                            deleteMutation.mutate(option.id);
                          }
                        }}
                        deleting={deleteMutation.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier option' : 'Nouvelle option'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </Card>
  );
}

export function AuditLogsPage() {
  const query = useQuery({ queryKey: ['stockini-audit-logs'], queryFn: stockiniApi.auditLogs });
  const data = query.data ?? [];
  return (
    <SimpleTable
      title="Audit logs"
      subtitle="Journal des actions backend sur les entités métier."
      loading={query.isLoading}
      error={query.error}
      headers={['Date', 'Action', 'Entité', 'Identifiant', 'Utilisateur']}
      rows={data.map((log: AuditLog) => [
        dateTime(log.createdAt),
        log.action,
        log.entity,
        log.entityId ?? '-',
        log.user?.fullName ?? log.user?.email ?? '-',
      ])}
    />
  );
}

function Identity({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
        {initials(name)}
      </span>
      <span className="font-medium">{name}</span>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className = normalized.includes('cancel') || normalized.includes('unpaid') || normalized.includes('open')
    ? 'border-red-200 bg-red-50 text-red-700'
    : normalized.includes('paid') || normalized.includes('completed') || normalized.includes('received') || normalized.includes('read')
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return <Badge className={className}>{statusLabel(value)}</Badge>;
}

function SimpleTable({ title, subtitle, headers, rows, loading, error }: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: React.ReactNode[][];
  loading: boolean;
  error: unknown;
}) {
  return (
    <>
      {title && <PageHeader title={title} subtitle={subtitle} />}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className={header.toLowerCase() === 'actions' ? 'text-right' : undefined}>
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={loading} error={error} empty={rows.length === 0} colSpan={headers.length} />
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={headers[cellIndex]?.toLowerCase() === 'actions' ? 'text-right' : undefined}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function MiniList({ title, items, loading, error }: { title: string; items: string[]; loading: boolean; error: unknown }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {Boolean(error) && <p className="text-sm text-red-600">Chargement impossible.</p>}
        {!loading && !error && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EditableMiniList({
  deleteItem,
  fields,
  items,
  loading,
  queryKey,
  saveItem,
  title,
}: {
  deleteItem: (item: Record<string, any>) => Promise<unknown>;
  fields: FieldConfig[];
  items: Array<Record<string, any>>;
  loading: boolean;
  queryKey: string;
  saveItem: (item: Record<string, any>, editing?: Record<string, any>) => Promise<unknown>;
  title: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const saveMutation = useMutation({
    mutationFn: () => saveItem(cleanPayload(form, fields) as Record<string, string>, editing ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Supprimé');
    },
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <CardTitle>{title}</CardTitle>
        <Button type="button" size="sm" onClick={() => { setEditing({}); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {!loading && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item.id ?? item.key ?? item.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            <span>{item.name ?? `${item.key}: ${item.value}`}</span>
            <RowActions
              onEdit={() => {
                setEditing(item);
                setForm(item);
              }}
              onDelete={() => deleteMutation.mutate(item)}
              deleting={deleteMutation.isPending}
            />
          </div>
        ))}
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id || editing.key ? `Modifier ${title.toLowerCase()}` : `Nouveau ${title.toLowerCase()}`}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
        />
      )}
    </Card>
  );
}

export function ReportsPage() {
  return <StockiniDashboardPage />;
}
