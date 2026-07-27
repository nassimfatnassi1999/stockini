'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, Plus, Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useUrlPagination } from '@/hooks/useUrlPagination';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, isPurchaseOrder, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { CaisseMovement, CaisseMovementType, Expense, ExpenseStatus, Purchase, TreasuryAccount } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ClearHistoryModal } from './shared/ClearHistoryModal';
import { KebabMenu } from './shared/KebabMenu';

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="app-page-title">{title}</h1>
        <p className="app-page-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

function StateRows({ loading, error, empty, colSpan }: { loading: boolean; error: unknown; empty: boolean; colSpan: number }) {
  if (loading) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Chargement...</TableCell></TableRow>;
  if (error) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-red-600">Impossible de charger les données.</TableCell></TableRow>;
  if (empty) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Aucune donnée trouvée.</TableCell></TableRow>;
  return null;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiellement payé</Badge>;
  return <Badge className="border-red-200 bg-red-50 text-red-700">Non payé</Badge>;
}

function PaymentMethodLabel({ method }: { method: string }) {
  const labels: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', CHECK: 'Chèque', CREDIT: 'Crédit' };
  return <>{labels[method] ?? method}</>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className={`mt-0.5 break-words text-sm font-medium text-text-primary ${mono ? 'font-mono' : ''}`}>{value ?? '-'}</div>
    </div>
  );
}

const CAISSE_MOVEMENT_LABELS: Record<CaisseMovementType, string> = {
  ENCAISSEMENT_VENTE: 'Encaissement vente',
  CUSTOMER_CHANGE_OUT: 'Monnaie client',
  CASH_SURPLUS_IN: 'Écart encaissé',
  DECAISSEMENT_ACHAT: 'Paiement fournisseur',
  DEPENSE_GENERALE: 'Dépense générale',
  DEPOT_MANUEL: 'Dépôt manuel',
  RETRAIT_MANUEL: 'Retrait manuel',
  ANNULATION_VENTE: 'Annulation vente',
  REFUND_OUT: 'Remboursement avoir',
  ANNULATION_ACHAT: 'Annulation achat',
  ANNULATION_DEPENSE: 'Suppression dépense',
  CASH_RESET: 'Remise à zéro',
};

const CAISSE_MOVEMENT_COLORS: Record<CaisseMovementType, string> = {
  ENCAISSEMENT_VENTE: 'text-emerald-600',
  CUSTOMER_CHANGE_OUT: 'text-blue-600',
  CASH_SURPLUS_IN: 'text-fuchsia-600',
  DECAISSEMENT_ACHAT: 'text-red-600',
  DEPENSE_GENERALE: 'text-red-600',
  DEPOT_MANUEL: 'text-emerald-600',
  RETRAIT_MANUEL: 'text-red-600',
  ANNULATION_VENTE: 'text-amber-600',
  REFUND_OUT: 'text-red-600',
  ANNULATION_ACHAT: 'text-amber-600',
  ANNULATION_DEPENSE: 'text-emerald-600',
  CASH_RESET: 'text-amber-600',
};

const PAYMENT_SOURCE_LABELS: Record<TreasuryAccount, string> = {
  PHYSICAL_CASH: 'Caisse physique',
  BANK_TREASURY: 'Banque / trésorerie',
};

const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  ACTIVE: 'Active',
  CANCELLED: 'Supprimée',
};

const FALLBACK_EXPENSE_CATEGORIES = [
  { value: 'Loyer', label: 'Loyer' },
  { value: 'Transport', label: 'Transport' },
  { value: 'Fournitures', label: 'Fournitures' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Charges', label: 'Charges' },
  { value: 'Autre', label: 'Autre' },
];

const FALLBACK_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'CHECK', label: 'Chèque' },
  { value: 'CREDIT', label: 'Crédit' },
];

function usePaymentMethodOptions() {
  const query = useQuery({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('payment_methods'),
  });
  const opts = (query.data ?? []).filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder).map((o) => ({ value: o.value, label: o.label }));
  return opts.length > 0 ? opts : FALLBACK_PAYMENT_METHODS;
}

function useExpenseCategoryOptions() {
  const query = useQuery({
    queryKey: ['stockini-dropdown-options', 'expense_categories'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('expense_categories'),
  });
  const opts = (query.data ?? []).filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder).map((o) => ({ value: o.value, label: o.label }));
  return opts.length > 0 ? opts : FALLBACK_EXPENSE_CATEGORIES;
}

export function DepensesPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canClearHistory = can('finance.history.clear');
  const canCreateExpense = can('expenses.create');
  const canDeleteExpense = can('expenses.delete') || can('expenses.cancel');
  const canViewExpense = can('expenses.view') || can('expenses.read');
  const [activeTab, setActiveTab] = useState<'general' | 'invoices' | 'history' | 'caisse'>('general');
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [showClearSupplierModal, setShowClearSupplierModal] = useState(false);
  const [showClearCaisseModal, setShowClearCaisseModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', note: '' });
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    paymentSource: 'PHYSICAL_CASH' as TreasuryAccount,
    category: '',
    subcategory: '',
    date: '',
    description: '',
    observations: '',
    supplierId: '',
    purchaseId: '',
    attachmentUrl: '',
  });
  const [expenseFilters, setExpenseFilters] = useState({
    search: '',
    category: '',
    paymentSource: '' as '' | TreasuryAccount,
    supplierId: '',
    dateFrom: '',
    dateTo: '',
    status: '' as '' | ExpenseStatus,
  });
  const [caisseTypeFilter, setCaisseTypeFilter] = useState<CaisseMovementType | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | 'UNPAID' | 'PARTIAL'>('');
  const {
    page: expensePage,
    limit: expenseLimit,
    setPage: setExpensePage,
    setLimit: setExpenseLimit,
  } = useUrlPagination();

  useEffect(() => {
    setExpenseForm((form) => ({
      ...form,
      date: new Date().toISOString().slice(0, 10),
    }));
  }, []);
  useEffect(() => setExpensePage(1), [expenseFilters]);
  const paymentMethodOptions = usePaymentMethodOptions();
  const expenseCategoryOptions = useExpenseCategoryOptions();

  const suppliersQuery = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });

  const purchasesQuery = useQuery({
    queryKey: ['stockini-payable-purchases', invoiceSearch, invoiceSupplierFilter, invoiceStatusFilter],
    queryFn: () =>
      stockiniApi.payablePurchases({
        search: invoiceSearch || undefined,
        supplierId: invoiceSupplierFilter || undefined,
        paymentStatus: invoiceStatusFilter || undefined,
      }),
  });
  const paymentsQuery = useQuery({
    queryKey: ['stockini-payments', 'supplier-expenses'],
    queryFn: () => stockiniApi.payments({ page: 1, limit: 100, type: 'SUPPLIER_PAYMENT' }),
  });
  const balanceQuery = useQuery({ queryKey: ['caisse-balance'], queryFn: stockiniApi.caisseBalance });
  const expensesQuery = useQuery({
    queryKey: ['stockini-expenses', expenseFilters, expensePage, expenseLimit],
    queryFn: () =>
      stockiniApi.expenses({
        page: expensePage,
        limit: expenseLimit,
        search: expenseFilters.search || undefined,
        category: expenseFilters.category || undefined,
        paymentSource: expenseFilters.paymentSource || undefined,
        supplierId: expenseFilters.supplierId || undefined,
        dateFrom: expenseFilters.dateFrom || undefined,
        dateTo: expenseFilters.dateTo || undefined,
        status: expenseFilters.status || undefined,
      }),
  });
  const expenseDetailsQuery = useQuery({
    queryKey: ['stockini-expense-details', selectedExpenseId],
    queryFn: () => stockiniApi.expense(selectedExpenseId!),
    enabled: !!selectedExpenseId,
  });
  const purchaseOptionsQuery = useQuery({
    queryKey: ['stockini-purchases-options', showExpenseModal],
    queryFn: () => stockiniApi.purchases({ page: 1, limit: 100 }),
    enabled: showExpenseModal,
  });
  const caisseHistoriqueQuery = useQuery({
    queryKey: ['caisse-historique', caisseTypeFilter],
    queryFn: () => stockiniApi.caisseHistorique(caisseTypeFilter || undefined),
  });

  // Défense frontend : un bon de commande ne doit jamais être compté comme dette fournisseur.
  const unpaidPurchases = (Array.isArray(purchasesQuery.data?.data) ? purchasesQuery.data.data : [])
    .filter((purchase) => !isPurchaseOrder(purchase.documentType));
  const totalRemaining = unpaidPurchases.reduce(
    (total, purchase) => total + Number(purchase.remainingAmount ?? 0),
    0,
  );
  const suppliers = suppliersQuery.data ?? [];
  const paymentsData = paymentsQuery.data?.data ?? [];
  const supplierPayments = paymentsData.filter((p) => !p.deletedAt);
  const expenses = expensesQuery.data?.data ?? [];
  const purchaseOptions = purchaseOptionsQuery.data?.data ?? [];

  const payMutation = useMutation({
    mutationFn: () => stockiniApi.payPurchase(payTarget!.id, { amount: Number(payForm.amount), method: payForm.method, note: payForm.note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payable-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      setPayTarget(null);
      setPayForm({ amount: '', method: 'CASH', note: '' });
      toast.success('Dépense enregistrée avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? (error as Error).message ?? 'Erreur lors de l\'enregistrement du paiement');
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      stockiniApi.createExpense({
        amount: Number(expenseForm.amount),
        paymentSource: expenseForm.paymentSource,
        category: expenseForm.category,
        subcategory: expenseForm.subcategory || undefined,
        date: expenseForm.date,
        description: expenseForm.description,
        observations: expenseForm.observations || undefined,
        supplierId: expenseForm.supplierId || undefined,
        purchaseId: expenseForm.purchaseId || undefined,
        attachmentUrl: expenseForm.attachmentUrl || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      setShowExpenseModal(false);
      setExpenseForm({
        amount: '',
        paymentSource: 'PHYSICAL_CASH',
        category: '',
        subcategory: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
        observations: '',
        supplierId: '',
        purchaseId: '',
        attachmentUrl: '',
      });
      toast.success('Dépense créée avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la création de la dépense');
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-expense-details'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports-overview'] });
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('report-') });
      setDeleteExpenseTarget(null);
      toast.success('Dépense supprimée et montant recrédité');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la suppression de la dépense');
    },
  });

  const clearSupplierMutation = useMutation({
    mutationFn: () => stockiniApi.clearSupplierPaymentsHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      setShowClearSupplierModal(false);
      toast.success(`Historique vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique'),
  });

  const clearCaisseMutation = useMutation({
    mutationFn: () => stockiniApi.clearCaisseHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      setShowClearCaisseModal(false);
      toast.success(`Historique caisse vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique caisse'),
  });

  const remaining = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum = Number(payForm.amount);
  const amountValid = amountNum > 0 && amountNum <= remaining + 0.001;
  const expenseAmount = Number(expenseForm.amount);
  const expenseValid =
    expenseAmount > 0 &&
    !!expenseForm.category &&
    !!expenseForm.date &&
    expenseForm.description.trim().length > 0;
  const soldeCaisse = Number(balanceQuery.data?.soldeCaisse ?? balanceQuery.data?.solde ?? 0);
  const soldeBanque = Number(balanceQuery.data?.soldeBanque ?? 0);
  const soldeGlobal = Number(balanceQuery.data?.soldeGlobal ?? soldeCaisse + soldeBanque);

  const caisseMovementData = (caisseHistoriqueQuery.data ?? []) as CaisseMovement[];

  const caisseIsPositive = (type: CaisseMovementType) =>
    type === 'ENCAISSEMENT_VENTE' || type === 'DEPOT_MANUEL' || type === 'ANNULATION_ACHAT' || type === 'ANNULATION_DEPENSE';

  const expenseDetails = expenseDetailsQuery.data;
  const initialExpenseMovement = expenseDetails?.caisseMovements.find((movement) => movement.type === 'DEPENSE_GENERALE');
  const reversalExpenseMovement = expenseDetails?.caisseMovements.find((movement) => movement.type === 'ANNULATION_DEPENSE');

  return (
    <>
      <PageHeader
        title="Dépenses fournisseurs"
        subtitle="Gestion des paiements fournisseurs, suivi des dettes et caisse."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['Caisse physique', soldeCaisse],
              ['Banque / trésorerie', soldeBanque],
              ['Total disponible', soldeGlobal],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <span className="text-text-muted">{label as string} : </span>
                <span className={`font-mono font-bold ${Number(value) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {money(value)}
                </span>
              </div>
            ))}
            {canCreateExpense && (
              <Button type="button" size="sm" onClick={() => setShowExpenseModal(true)}>
                <Plus size={15} /> Nouvelle dépense
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex gap-0 border-b border-border">
        {(['general', 'invoices', 'history', 'caisse'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'general' && 'Dépenses générales'}
            {tab === 'invoices' && <>Factures à payer{unpaidPurchases.length > 0 && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">{unpaidPurchases.length}</span>}</>}
            {tab === 'history' && 'Paiements fournisseurs'}
            {tab === 'caisse' && 'Historique caisse'}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="grid gap-2 border-b border-border px-4 py-3 md:grid-cols-3 lg:grid-cols-6">
              <Input
                type="search"
                placeholder="Rechercher..."
                value={expenseFilters.search}
                onChange={(e) => setExpenseFilters((f) => ({ ...f, search: e.target.value }))}
                className="h-9"
              />
              <select value={expenseFilters.category} onChange={(e) => setExpenseFilters((f) => ({ ...f, category: e.target.value }))} className="app-select h-9 text-sm">
                <option value="">Toutes catégories</option>
                {expenseCategoryOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select value={expenseFilters.paymentSource} onChange={(e) => setExpenseFilters((f) => ({ ...f, paymentSource: e.target.value as '' | TreasuryAccount }))} className="app-select h-9 text-sm">
                <option value="">Toutes sources</option>
                <option value="PHYSICAL_CASH">Caisse physique</option>
                <option value="BANK_TREASURY">Banque / trésorerie</option>
              </select>
              <select value={expenseFilters.supplierId} onChange={(e) => setExpenseFilters((f) => ({ ...f, supplierId: e.target.value }))} className="app-select h-9 text-sm">
                <option value="">Tous fournisseurs</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={expenseFilters.status} onChange={(e) => setExpenseFilters((f) => ({ ...f, status: e.target.value as '' | ExpenseStatus }))} className="app-select h-9 text-sm">
                <option value="">Tous statuts</option>
                <option value="ACTIVE">Active</option>
                <option value="CANCELLED">Supprimée</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={expenseFilters.dateFrom} onChange={(e) => setExpenseFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="h-9" />
                <Input type="date" value={expenseFilters.dateTo} onChange={(e) => setExpenseFilters((f) => ({ ...f, dateTo: e.target.value }))} className="h-9" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Source paiement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={expensesQuery.isLoading} error={expensesQuery.error} empty={expenses.length === 0} colSpan={8} />
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-text-secondary">{dateTime(expense.expenseDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{expense.category}</div>
                      <div className="max-w-[260px] truncate text-xs text-text-muted">{expense.description}</div>
                    </TableCell>
                    <TableCell>{expense.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{money(expense.amount)}</TableCell>
                    <TableCell>{PAYMENT_SOURCE_LABELS[expense.paymentSource]}</TableCell>
                    <TableCell>
                      <Badge className={expense.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                        {EXPENSE_STATUS_LABELS[expense.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-secondary">{expense.createdBy?.fullName ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <KebabMenu
                        items={[
                          {
                            label: 'Voir les détails',
                            icon: <Eye size={14} />,
                            onClick: () => setSelectedExpenseId(expense.id),
                            hidden: !canViewExpense,
                          },
                          { divider: true, hidden: !canDeleteExpense || expense.status !== 'ACTIVE' },
                          {
                            label: 'Supprimer la dépense',
                            icon: <Trash2 size={14} />,
                            onClick: () => setDeleteExpenseTarget(expense),
                            variant: 'destructive',
                            hidden: !canDeleteExpense || expense.status !== 'ACTIVE',
                          },
                        ]}
                        ariaLabel={`Actions pour ${expense.reference}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(expensesQuery.data?.total ?? 0) > 0 && (
              <DataTablePagination
                page={expensePage}
                limit={expenseLimit}
                totalItems={expensesQuery.data?.total ?? 0}
                totalPages={expensesQuery.data?.totalPages ?? 0}
                disabled={expensesQuery.isFetching}
                onPageChange={setExpensePage}
                onLimitChange={setExpenseLimit}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'invoices' && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="search"
                  placeholder="Rechercher un document achat..."
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="h-9 sm:max-w-xs"
                />
                <select
                  value={invoiceSupplierFilter}
                  onChange={(e) => setInvoiceSupplierFilter(e.target.value)}
                  className="app-select h-9 text-sm"
                >
                  <option value="">Tous les fournisseurs</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value as '' | 'UNPAID' | 'PARTIAL')}
                  className="app-select h-9 text-sm"
                >
                  <option value="">Tous les statuts</option>
                  <option value="UNPAID">Non payé</option>
                  <option value="PARTIAL">Partiellement payé</option>
                </select>
              </div>
              <div className="text-sm whitespace-nowrap">
                <span className="text-text-muted">Total à payer : </span>
                <span className="font-mono font-bold text-red-600">{money(totalRemaining)}</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Document achat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="text-right">Déjà payé</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={purchasesQuery.isLoading} error={purchasesQuery.error} empty={unpaidPurchases.length === 0} colSpan={8} />
                {unpaidPurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-mono font-semibold text-primary">{purchase.orderNumber}</TableCell>
                    <TableCell>{purchase.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-text-secondary">{dateTime(purchase.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono">{money(purchase.totalFinal)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{money(purchase.paidAmount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{money(purchase.remainingAmount)}</TableCell>
                    <TableCell><PaymentStatusBadge status={purchase.paymentStatus} /></TableCell>
                    <TableCell className="text-right">
                      {!isPurchaseOrder(purchase.documentType) ? (
                        <Button type="button" size="sm" onClick={() => { setPayTarget(purchase); setPayForm({ amount: Number(purchase.remainingAmount).toFixed(3), method: 'CASH', note: '' }); }}>
                          Payer
                        </Button>
                      ) : (
                        <span className="text-xs text-text-muted italic">Bon de commande</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'history' && (
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearSupplierModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Document achat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={paymentsQuery.isLoading} error={paymentsQuery.error} empty={supplierPayments.length === 0} colSpan={7} />
                {supplierPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-text-secondary">{dateTime(payment.createdAt)}</TableCell>
                    <TableCell className="font-mono font-semibold">{payment.reference}</TableCell>
                    <TableCell className="font-mono text-text-secondary">{payment.purchase?.orderNumber ?? '-'}</TableCell>
                    <TableCell>{payment.supplier?.name ?? payment.purchase?.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{money(payment.amount)}</TableCell>
                    <TableCell><PaymentMethodLabel method={payment.method} /></TableCell>
                    <TableCell className="text-text-secondary">{payment.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      {activeTab === 'caisse' && (
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearCaisseModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-sm font-medium text-text-primary">Historique des mouvements caisse</span>
              <select
                value={caisseTypeFilter}
                onChange={(e) => setCaisseTypeFilter(e.target.value as CaisseMovementType | '')}
                className="app-select h-8 text-sm"
              >
                <option value="">Tous les types</option>
                {(Object.entries(CAISSE_MOVEMENT_LABELS) as [CaisseMovementType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">Solde avant</TableHead>
                  <TableHead className="text-right">Solde après</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={caisseHistoriqueQuery.isLoading} error={caisseHistoriqueQuery.error} empty={caisseMovementData.length === 0} colSpan={9} />
                {caisseMovementData.map((mov) => {
                  const isPos = caisseIsPositive(mov.type);
                  return (
                    <TableRow key={mov.id}>
                      <TableCell className="text-text-secondary">{dateTime(mov.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={isPos ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>
                          {CAISSE_MOVEMENT_LABELS[mov.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>{mov.treasuryAccount ? PAYMENT_SOURCE_LABELS[mov.treasuryAccount] : '-'}</TableCell>
                      <TableCell className="text-text-secondary">{mov.motif ?? '-'}</TableCell>
                      <TableCell className="font-mono text-text-secondary">{mov.referenceDoc ?? '-'}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${CAISSE_MOVEMENT_COLORS[mov.type]}`}>
                        {isPos ? '+' : '-'}{money(mov.montant)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-text-secondary">{money(mov.ancienSolde)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${Number(mov.nouveauSolde) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {money(mov.nouveauSolde)}
                      </TableCell>
                      <TableCell className="text-text-secondary">{mov.user?.fullName ?? '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      <ClearHistoryModal
        open={showClearSupplierModal}
        onClose={() => setShowClearSupplierModal(false)}
        onConfirm={() => clearSupplierMutation.mutate()}
        isPending={clearSupplierMutation.isPending}
        moduleName="Paiements fournisseurs"
      />

      <ClearHistoryModal
        open={showClearCaisseModal}
        onClose={() => setShowClearCaisseModal(false)}
        onConfirm={() => clearCaisseMutation.mutate()}
        isPending={clearCaisseMutation.isPending}
        moduleName="Historique caisse"
      />

      {/* Modal dépense générale */}
      <SlideOver
        title="Nouvelle dépense"
        subtitle="Dépense générale hors paiement fournisseur"
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        width={520}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowExpenseModal(false)}>Annuler</Button>
            <Button type="submit" form="general-expense-form" size="sm" disabled={createExpenseMutation.isPending || !expenseValid}>
              <Check size={14} />{createExpenseMutation.isPending ? 'Création...' : 'Créer la dépense'}
            </Button>
          </>
        }
      >
        <form id="general-expense-form" onSubmit={(e) => { e.preventDefault(); if (expenseValid) createExpenseMutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">Montant *</Label>
              <Input id="expense-amount" type="number" min="0.001" step="0.001" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date *</Label>
              <Input id="expense-date" type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-source">Type de paiement *</Label>
            <select id="expense-source" value={expenseForm.paymentSource} onChange={(e) => setExpenseForm((f) => ({ ...f, paymentSource: e.target.value as TreasuryAccount }))} className="app-select" required>
              <option value="PHYSICAL_CASH">Caisse physique</option>
              <option value="BANK_TREASURY">Banque / trésorerie</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-category">Catégorie dépense *</Label>
            <select id="expense-category" value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} className="app-select" required>
              <option value="">Sélectionner une catégorie</option>
              {expenseCategoryOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-subcategory">Sous catégorie</Label>
            <Input id="expense-subcategory" value={expenseForm.subcategory} onChange={(e) => setExpenseForm((f) => ({ ...f, subcategory: e.target.value }))} placeholder="Sous catégorie (optionnel)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-description">Description / note *</Label>
            <Textarea id="expense-description" value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} required rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-observations">Observations</Label>
            <Textarea id="expense-observations" value={expenseForm.observations} onChange={(e) => setExpenseForm((f) => ({ ...f, observations: e.target.value }))} rows={2} placeholder="Informations complémentaires (optionnel)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-supplier">Fournisseur</Label>
              <select id="expense-supplier" value={expenseForm.supplierId} onChange={(e) => setExpenseForm((f) => ({ ...f, supplierId: e.target.value, purchaseId: '' }))} className="app-select">
                <option value="">Aucun</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-purchase">Document achat lié</Label>
              <select id="expense-purchase" value={expenseForm.purchaseId} onChange={(e) => setExpenseForm((f) => ({ ...f, purchaseId: e.target.value }))} className="app-select">
                <option value="">Aucun</option>
                {purchaseOptions
                  .filter((p) => !expenseForm.supplierId || p.supplier?.id === expenseForm.supplierId)
                  .map((p) => <option key={p.id} value={p.id}>{p.orderNumber}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-attachment">Pièce jointe / justificatif</Label>
            <Input id="expense-attachment" type="text" value={expenseForm.attachmentUrl} onChange={(e) => setExpenseForm((f) => ({ ...f, attachmentUrl: e.target.value }))} placeholder="URL ou référence du justificatif" />
          </div>
        </form>
      </SlideOver>

      <SlideOver
        title="Détails de la dépense"
        subtitle={expenseDetails?.reference}
        open={!!selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        width={720}
      >
        {expenseDetailsQuery.isLoading && <p className="py-12 text-center text-sm text-text-secondary">Chargement des détails...</p>}
        {expenseDetailsQuery.isError && <p className="py-12 text-center text-sm text-red-600">Impossible de charger les détails de la dépense.</p>}
        {expenseDetails && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-border bg-white p-4 shadow-sm">
              <div>
                <div className="font-mono text-sm font-semibold text-primary">{expenseDetails.reference}</div>
                <div className="mt-1 text-xs text-text-muted">{expenseDetails.category}</div>
              </div>
              <Badge className={expenseDetails.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>
                {EXPENSE_STATUS_LABELS[expenseDetails.status]}
              </Badge>
            </div>

            <DetailSection title="Informations générales">
              <DetailRow label="Référence" value={expenseDetails.reference} mono />
              <DetailRow label="Date" value={new Date(expenseDetails.expenseDate).toLocaleDateString('fr-TN')} />
              <DetailRow label="Heure" value={new Date(expenseDetails.expenseDate).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })} />
              <DetailRow label="Utilisateur" value={expenseDetails.createdBy?.fullName ?? '-'} />
              <DetailRow label="Fournisseur" value={expenseDetails.supplier?.name ?? '-'} />
              <DetailRow label="Catégorie" value={expenseDetails.category} />
              <DetailRow label="Sous catégorie" value={expenseDetails.subcategory ?? '-'} />
              <DetailRow label="Description" value={expenseDetails.description} />
              <DetailRow label="Observations" value={expenseDetails.observations ?? '-'} />
            </DetailSection>

            <DetailSection title="Informations financières">
              <DetailRow label="Montant" value={money(expenseDetails.amount)} mono />
              <DetailRow label="Source paiement" value={PAYMENT_SOURCE_LABELS[expenseDetails.paymentSource]} />
              <DetailRow label="Caisse physique" value={expenseDetails.paymentSource === 'PHYSICAL_CASH' ? money(expenseDetails.amount) : '-'} mono />
              <DetailRow label="Banque" value={expenseDetails.paymentSource === 'BANK_TREASURY' ? money(expenseDetails.amount) : '-'} mono />
              <DetailRow label="Trésorerie" value={PAYMENT_SOURCE_LABELS[expenseDetails.paymentSource]} />
            </DetailSection>

            <DetailSection title="Impact financier">
              <DetailRow label="Avant opération" value={initialExpenseMovement ? money(initialExpenseMovement.ancienSolde) : '-'} mono />
              <DetailRow label="Mouvement effectué" value={`-${money(expenseDetails.amount)}`} mono />
              <DetailRow label="Solde après opération" value={initialExpenseMovement ? money(initialExpenseMovement.nouveauSolde) : '-'} mono />
              <DetailRow label="Contre-écriture" value={reversalExpenseMovement ? `+${money(reversalExpenseMovement.montant)}` : '-'} mono />
            </DetailSection>

            <DetailSection title="Traçabilité">
              <DetailRow label="ID" value={expenseDetails.id} mono />
              <DetailRow label="Date création" value={dateTime(expenseDetails.createdAt)} />
              <DetailRow label="Dernière modification" value={dateTime(expenseDetails.updatedAt)} />
              <DetailRow label="Journal d’audit" value={`${expenseDetails.auditLogs.length} événement(s)`} />
            </DetailSection>

            <section className="space-y-2">
              <h3 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Journal d’audit</h3>
              {expenseDetails.auditLogs.length === 0 ? (
                <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-sm text-text-muted">Aucun événement d’audit.</p>
              ) : (
                <div className="space-y-2">
                  {expenseDetails.auditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-text-primary">{log.action}</span>
                        <span className="text-xs text-text-muted">{dateTime(log.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">{log.user?.fullName ?? log.userName ?? 'Système'}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SlideOver>

      <SlideOver
        title="Supprimer cette dépense ?"
        subtitle={deleteExpenseTarget?.reference}
        open={!!deleteExpenseTarget}
        onClose={() => setDeleteExpenseTarget(null)}
        width={460}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" disabled={deleteExpenseMutation.isPending} onClick={() => setDeleteExpenseTarget(null)}>Annuler</Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteExpenseMutation.isPending || !deleteExpenseTarget}
              onClick={() => deleteExpenseTarget && deleteExpenseMutation.mutate(deleteExpenseTarget.id)}
            >
              <Trash2 size={14} />{deleteExpenseMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-700" size={20} />
            <p className="text-sm leading-6 text-red-900">
              Cette opération supprimera la dépense et recréditera automatiquement le montant dans la source de paiement utilisée.
            </p>
          </div>
          {deleteExpenseTarget && (
            <div className="rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-text-muted">Référence</span><span className="font-mono font-semibold">{deleteExpenseTarget.reference}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span className="text-text-muted">Montant recrédité</span><span className="font-mono font-semibold text-emerald-600">+{money(deleteExpenseTarget.amount)}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span className="text-text-muted">Source</span><span className="font-medium">{PAYMENT_SOURCE_LABELS[deleteExpenseTarget.paymentSource]}</span></div>
            </div>
          )}
          <p className="text-sm text-text-secondary">Cette action sera enregistrée dans l’audit.</p>
        </div>
      </SlideOver>

      {/* Modal paiement fournisseur */}
      <SlideOver
        title="Payer"
        subtitle={payTarget?.orderNumber}
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        width={480}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setPayTarget(null)}>Annuler</Button>
            <Button type="submit" form="depenses-pay-form" size="sm" disabled={payMutation.isPending || !amountValid}>
              <Check size={14} />{payMutation.isPending ? 'Enregistrement...' : 'Confirmer le paiement'}
            </Button>
          </>
        }
      >
        {payTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Fournisseur</span><span className="font-medium">{payTarget.supplier?.name ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Document achat</span><span className="font-mono font-medium">{payTarget.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Total TTC</span><span className="font-mono font-medium">{money(payTarget.total)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Timbre fiscal</span><span className="font-mono font-medium">{money(payTarget.stampDuty)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total à payer</span><span className="font-mono">{money(payTarget.totalFinal)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Déjà payé</span><span className="font-mono font-medium text-emerald-600">{money(payTarget.paidAmount)}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">Reste à payer</span><span className="font-mono font-bold text-red-600">{money(payTarget.remainingAmount)}</span></div>
            </div>
            <form id="depenses-pay-form" onSubmit={(e) => { e.preventDefault(); if (!amountValid) return; payMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Montant à payer *</Label>
                <Input id="pay-amount" type="number" min="0.001" max={remaining} step="0.001" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} required className={payForm.amount && !amountValid ? 'border-red-400' : ''} />
                {payForm.amount && !amountValid && <p className="text-xs text-red-600">{amountNum <= 0 ? 'Le montant doit être supérieur à 0' : `Le montant ne peut pas dépasser ${money(remaining)}`}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Mode de paiement *</Label>
                <select id="pay-method" value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} className="app-select" required>
                  {paymentMethodOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-note">Note (optionnel)</Label>
                <Input id="pay-note" type="text" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="Référence chèque, virement..." />
              </div>
            </form>
          </div>
        )}
      </SlideOver>
    </>
  );
}
