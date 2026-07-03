"use client";

import React, {
  useState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  Receipt,
  RotateCcw,
  Trash2,
  Truck,
  UserCircle,
  X,
} from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { KebabMenu } from "@/components/stockini/shared/KebabMenu";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { generateClientId } from "@/lib/id";
import { PermissionGuard } from "@/components/shared/PermissionGuard";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useFormDraft } from "@/hooks/useFormDraft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductRegisterGrid } from "@/components/stockini/register/ProductRegisterGrid";
import { SaleDetailsModal } from "@/components/stockini/SaleDetailsModal";
import { MoveToTrashDialog } from "@/components/stockini/MoveToTrashDialog";
import { EmailToast } from "@/components/stockini/EmailToast";
import { GeneratedDocumentsHistory } from "@/components/stockini/GeneratedDocumentsHistory";
import { AvoirPage } from "@/components/stockini/pages/AvoirPage";
import {
  calculateSalesDocumentTotals,
  createEmptyLine,
  isFilledLine,
  MIN_MARGIN_PERCENT,
  recalculateSaleLine,
  type DocumentTotals,
  type RegisterLine,
} from "@/lib/stockini/register-utils";
import { getPaymentDisplay, money } from "@/lib/stockini/format";
import { stockiniApi } from "@/lib/stockini/api";
import { cn } from "@/lib/utils";
import { HistoryToolbar } from "@/components/stockini/shared/HistoryToolbar";
import { BulkActionsBar } from "@/components/stockini/shared/BulkActionsBar";
import type {
  Customer,
  DropdownOption,
  EmailPreview,
  PaginatedResponse,
  Sale,
  SaleDetail,
  SalesDocumentType,
  SalesQueryParams,
} from "@/lib/stockini/types";

const PERMISSION_LOW_MARGIN = "sales.allow_low_margin";
const PERMISSION_EDIT_UNIT_PRICE_HT = "sales.line.edit_unit_price_ht";
const PERMISSION_VIEW_DETAILS = "sales.view_details";
const PERMISSION_DELETE_SALE = "sales.delete";

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  RETURNED: "Retournée",
  PARTIALLY_REFUNDED: "Partiellement remboursée",
  REFUNDED: "Remboursée",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DRAFT: "border-yellow-200 bg-yellow-50 text-yellow-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  RETURNED: "border-orange-200 bg-orange-50 text-orange-700",
  PARTIALLY_REFUNDED: "border-amber-200 bg-amber-50 text-amber-700",
  REFUNDED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const SALES_DOCUMENT_TYPES = new Set<SalesDocumentType>([
  "DEVIS",
  "BON_COMMANDE",
  "BON_LIVRAISON",
  "FACTURE",
  "AVOIR",
]);

const SALES_API_DOCUMENT_TYPES = new Set<SalesDocumentType>([
  "DEVIS",
  "BON_COMMANDE",
  "BON_LIVRAISON",
  "FACTURE",
]);

// Central config — add new types here without touching any other code
const GENERATABLE_DOC_TYPES: Array<{ type: SalesDocumentType; label: string }> =
  [
    { type: "DEVIS", label: "Générer devis" },
    { type: "BON_COMMANDE", label: "Générer bon de commande" },
    { type: "BON_LIVRAISON", label: "Générer bon de livraison" },
    { type: "FACTURE", label: "Générer facture" },
    { type: "AVOIR", label: "Générer avoir" },
  ];

const PDF_ACTIONS = GENERATABLE_DOC_TYPES;

// Types de documents transformables (source)
const TRANSFORMABLE_TYPES: SalesDocumentType[] = [
  "DEVIS",
  "BON_COMMANDE",
  "BON_LIVRAISON",
];

// Flux strict : seul le step suivant est autorisé (pas de saut d'étape, pas de retour arrière)
const NEXT_TRANSFORM: Record<string, SalesDocumentType> = {
  DEVIS: "BON_COMMANDE",
  BON_COMMANDE: "BON_LIVRAISON",
  BON_LIVRAISON: "FACTURE",
};

// Tous les types dans l'ordre pour le dropdown de transformation
const ALL_TRANSFORM_OPTIONS: Array<{
  type: SalesDocumentType;
  label: string;
  Icon: React.ElementType;
}> = [
  { type: "DEVIS", label: "Devis", Icon: FileText },
  { type: "BON_COMMANDE", label: "Bon de commande", Icon: ClipboardList },
  { type: "BON_LIVRAISON", label: "Bon de livraison", Icon: Truck },
  { type: "FACTURE", label: "Facture", Icon: Receipt },
  { type: "AVOIR", label: "Avoir", Icon: RotateCcw },
];

const DOC_TYPE_BADGE: Record<string, string> = {
  DEVIS: "bg-gray-100 text-gray-600 border-gray-200",
  BON_COMMANDE: "bg-blue-50 text-blue-600 border-blue-200",
  BON_LIVRAISON: "bg-purple-50 text-purple-600 border-purple-200",
  FACTURE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  AVOIR: "bg-red-50 text-red-600 border-red-200",
};

const DOC_TYPE_SHORT: Record<string, string> = {
  DEVIS: "Devis",
  BON_COMMANDE: "Cmd",
  BON_LIVRAISON: "BL",
  FACTURE: "Fac",
  AVOIR: "Avoir",
};

const DOC_TAB_CONFIG: Array<{
  id: SalesDocumentType;
  label: string;
  saveLabel: string;
  affectsStock: boolean;
  acceptsPayment: boolean;
  activeClass: string;
  hoverClass: string;
  badgeClass: string;
  Icon: React.ElementType;
}> = [
  {
    id: "DEVIS",
    label: "Devis",
    saveLabel: "Enregistrer le devis",
    affectsStock: false,
    acceptsPayment: false,
    activeClass: "bg-[#FF6B35] text-white shadow-sm",
    hoverClass: "text-text-secondary hover:bg-orange-50 hover:text-orange-700",
    badgeClass: "bg-[#FF6B35]",
    Icon: FileText,
  },
  {
    id: "BON_COMMANDE",
    label: "Bon de commande",
    saveLabel: "Enregistrer le bon de commande",
    affectsStock: false,
    acceptsPayment: false,
    activeClass: "bg-[#4A90D9] text-white shadow-sm",
    hoverClass: "text-text-secondary hover:bg-blue-50 hover:text-blue-700",
    badgeClass: "bg-[#4A90D9]",
    Icon: ClipboardList,
  },
  {
    id: "BON_LIVRAISON",
    label: "Bon de livraison",
    saveLabel: "Enregistrer le bon de livraison",
    affectsStock: true,
    acceptsPayment: true,
    activeClass: "bg-[#27AE60] text-white shadow-sm",
    hoverClass: "text-text-secondary hover:bg-green-50 hover:text-green-700",
    badgeClass: "bg-[#27AE60]",
    Icon: Truck,
  },
  {
    id: "FACTURE",
    label: "Facture",
    saveLabel: "Enregistrer la facture",
    affectsStock: true,
    acceptsPayment: true,
    activeClass: "bg-[#E74C3C] text-white shadow-sm",
    hoverClass: "text-text-secondary hover:bg-red-50 hover:text-red-700",
    badgeClass: "bg-[#E74C3C]",
    Icon: Receipt,
  },
  {
    id: "AVOIR",
    label: "Avoir",
    saveLabel: "",
    affectsStock: false,
    acceptsPayment: false,
    activeClass: "bg-[#95A5A6] text-white shadow-sm",
    hoverClass: "text-text-secondary hover:bg-gray-100 hover:text-gray-700",
    badgeClass: "bg-[#95A5A6]",
    Icon: RotateCcw,
  },
];

// ─── Transform picker modal ───────────────────────────────────────────────────

interface TransformPickerModalProps {
  sale: Sale;
  onSelect: (targetType: SalesDocumentType) => void;
  onCancel: () => void;
}

function TransformPickerModal({
  sale,
  onSelect,
  onCancel,
}: TransformPickerModalProps) {
  const sourceLabel = DOC_TYPE_SHORT[sale.documentType] ?? sale.documentType;
  const recommendedTarget = NEXT_TRANSFORM[sale.documentType];

  if (typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-200 rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Transformer depuis
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${DOC_TYPE_BADGE[sale.documentType] ?? ""}`}
              >
                {sourceLabel}
              </span>
              <span className="font-mono text-xs font-semibold text-slate-600">
                {sale.invoiceNumber}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Options — all clickable, no disabled */}
        <div className="space-y-1.5 p-3">
          {ALL_TRANSFORM_OPTIONS.map((opt) => {
            const isRecommended = opt.type === recommendedTarget;
            const isSame = opt.type === sale.documentType;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => onSelect(opt.type)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  isRecommended
                    ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                  isSame && "opacity-50",
                )}
              >
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${DOC_TYPE_BADGE[opt.type] ?? ""}`}
                >
                  <opt.Icon size={10} />
                  {opt.label}
                </span>
                <span
                  className={cn(
                    "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    isRecommended
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-600"
                      : "text-slate-400",
                  )}
                >
                  {isSame
                    ? "Même type"
                    : isRecommended
                      ? "Disponible →"
                      : "Indisponible"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 w-full rounded-lg border border-slate-200 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Transform dropdown button (per row) ─────────────────────────────────────

interface TransformDropdownButtonProps {
  sale: Sale;
  onSelect: (targetType: SalesDocumentType) => void;
}

function TransformDropdownButton({
  sale,
  onSelect,
}: TransformDropdownButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium border border-orange-200/70 bg-orange-50 text-orange-700 transition-all duration-150 hover:-translate-y-px hover:border-orange-300 hover:bg-orange-100 whitespace-nowrap"
      >
        <ArrowRightLeft size={12} />
        Transformer
      </button>
      {open && (
        <TransformPickerModal
          sale={sale}
          onSelect={(t) => {
            setOpen(false);
            onSelect(t);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Transform confirm modal ──────────────────────────────────────────────────

interface TransformConfirmModalProps {
  sale: Sale;
  targetType: SalesDocumentType;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function TransformConfirmModal({
  sale,
  targetType,
  isPending,
  onConfirm,
  onCancel,
}: TransformConfirmModalProps) {
  const sourceLabel = DOC_TYPE_SHORT[sale.documentType] ?? sale.documentType;
  const targetLabel = DOC_TYPE_SHORT[targetType] ?? targetType;
  const targetFull =
    ALL_TRANSFORM_OPTIONS.find((o) => o.type === targetType)?.label ??
    targetType;
  const targetAppliesStock =
    targetType === "BON_LIVRAISON" || targetType === "FACTURE";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={!isPending ? onCancel : undefined}
      />
      <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full bg-orange-100">
            <ArrowRightLeft size={18} className="text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              Transformer en {targetFull}
            </h3>
            <p className="text-xs text-slate-400">
              Cette action est irréversible
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 mb-4 leading-relaxed">
          Confirmer la transformation de{" "}
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium mx-0.5 ${DOC_TYPE_BADGE[sale.documentType] ?? ""}`}
          >
            {sourceLabel}
          </span>{" "}
          <span className="font-mono font-semibold text-slate-900">
            {sale.invoiceNumber}
          </span>{" "}
          en{" "}
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium mx-0.5 ${DOC_TYPE_BADGE[targetType] ?? ""}`}
          >
            {targetLabel}
          </span>{" "}
          ?
        </p>

        {targetAppliesStock && !sale.stockImpactDone && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-4">
            Le stock sera décrémenté pour chaque article au moment de la
            transformation.
          </div>
        )}
        {targetAppliesStock && sale.stockImpactDone && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 mb-4">
            Stock déjà appliqué sur la source — aucun double décrément.
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? "En cours…" : "Transformer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validate document modal ─────────────────────────────────────────────────

interface ValidateDocModalProps {
  docType: SalesDocumentType;
  isPending: boolean;
  paymentMethods: DropdownOption[];
  totals: DocumentTotals;
  onConfirm: (paidAmount: number, paymentMethod: string) => void;
  onCancel: () => void;
}

function ValidateDocumentModal({
  docType,
  isPending,
  paymentMethods,
  totals,
  onConfirm,
  onCancel,
}: ValidateDocModalProps) {
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [pmtError, setPmtError] = useState("");

  const paymentAllowed = docType === "FACTURE" || docType === "BON_LIVRAISON";
  const paidAmountNum = Number(paidAmount) || 0;

  const tabCfg = DOC_TAB_CONFIG.find((t) => t.id === docType);

  const handleConfirm = () => {
    if (paymentAllowed && paidAmountNum > 0 && !paymentMethod) {
      setPmtError("Veuillez sélectionner une méthode de paiement");
      return;
    }
    onConfirm(
      paymentAllowed ? paidAmountNum : 0,
      paymentAllowed && paidAmountNum > 0 ? paymentMethod : "",
    );
  };

  const footer = (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={onCancel}
        disabled={isPending}
      >
        Annuler
      </Button>
      <Button
        size="sm"
        className="flex-1"
        onClick={handleConfirm}
        disabled={isPending}
      >
        {isPending ? "Enregistrement…" : "Confirmer"}
      </Button>
    </div>
  );

  return (
    <SlideOver
      title={tabCfg?.saveLabel ?? "Valider le document"}
      open={true}
      onClose={onCancel}
      width={460}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Document type badge */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-4 py-3">
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${DOC_TYPE_BADGE[docType] ?? ""}`}
          >
            {DOC_TYPE_SHORT[docType] ?? docType}
          </span>
          <div className="flex-1">
            <p className="text-xs font-medium text-text-primary">
              {tabCfg?.label}
            </p>
            <p className="text-[11px] text-text-muted">
              {tabCfg?.affectsStock
                ? "Décrémente le stock immédiatement"
                : "Aucun impact sur le stock"}
            </p>
          </div>
          <span className="text-lg font-bold tabular-nums text-text-primary">
            {money(totals.totalTtc)} DT
          </span>
        </div>

        {/* Payment section — only for BL / Facture */}
        {paymentAllowed ? (
          <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Paiement (optionnel)
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="vm-paid" className="text-xs">
                Montant payé (DT)
              </Label>
              <Input
                id="vm-paid"
                type="number"
                min={0}
                step={0.001}
                value={paidAmount}
                onChange={(e) => {
                  setPaidAmount(e.target.value);
                  setPmtError("");
                }}
                placeholder="0.000"
                className="h-9 text-sm"
              />
            </div>
            {paidAmountNum > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="vm-method" className="text-xs">
                  Méthode de paiement *
                </Label>
                <select
                  id="vm-method"
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    setPmtError("");
                  }}
                  className="app-select h-9 text-sm"
                >
                  <option value="">— Sélectionner —</option>
                  {paymentMethods.map((opt) => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {pmtError && (
                  <p className="text-[11px] text-red-500">{pmtError}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Paiement disponible uniquement pour{" "}
            <strong>Bon de livraison</strong> et <strong>Facture</strong>.
          </div>
        )}
      </div>
    </SlideOver>
  );
}

interface VenteDraft {
  lines: RegisterLine[];
  customerId: string;
  clientInfoName: string;
  counterClientName: string;
  counterClientEmail: string;
  counterClientPhone: string;
  counterClientAddress: string;
  counterClientTaxId: string;
  counterClientNote: string;
  saleDate: string;
  activeTab: SalesDocumentType;
}

export default function VentesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const initialLineId = useId();
  const [lines, setLines] = useState<RegisterLine[]>(() => [createEmptyLine(initialLineId)]);
  const [customerId, setCustomerId] = useState("");
  const [clientInfoName, setClientInfoName] = useState("");
  const [counterClientName, setCounterClientName] = useState("");
  const [counterClientEmail, setCounterClientEmail] = useState("");
  const [counterClientPhone, setCounterClientPhone] = useState("");
  const [counterClientAddress, setCounterClientAddress] = useState("");
  const [counterClientTaxId, setCounterClientTaxId] = useState("");
  const [counterClientNote, setCounterClientNote] = useState("");
  const [showCounterPanel, setShowCounterPanel] = useState(false);
  const [counterClientErrors, setCounterClientErrors] = useState<
    Record<string, string>
  >({});
  const [saleDate, setSaleDate] = useState('');
  const [activeHistoryTab, setActiveHistoryTab] = useState<
    "ventes" | "documents"
  >("ventes");
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [transformTarget, setTransformTarget] = useState<{
    sale: Sale;
    targetType: SalesDocumentType;
  } | null>(null);
  // ── Sales history pagination + filters ────────────────────────────────────
  const [salesPage, setSalesPage] = useState(1);
  const [salesLimit, setSalesLimit] = useState(5);
  const [salesSearch, setSalesSearch] = useState("");
  const [salesLocalSearch, setSalesLocalSearch] = useState("");
  const [salesDocType, setSalesDocType] = useState("");
  const [salesStatus, setSalesStatus] = useState("");
  const salesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSalesSearchChange = (value: string) => {
    setSalesLocalSearch(value);
    if (salesDebounceRef.current) clearTimeout(salesDebounceRef.current);
    salesDebounceRef.current = setTimeout(() => {
      setSalesSearch(value);
      setSalesPage(1);
    }, 300);
  };

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);

  useEffect(() => {
    setSaleDate(new Date().toISOString());
  }, []);

  const [activeTab, setActiveTab] = useState<SalesDocumentType>("DEVIS");

  // Multi-selection for invoice history
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Document generation panel (opened by Download button only)
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  const [docMenuGenerating, setDocMenuGenerating] =
    useState<SalesDocumentType | null>(null);

  // Email toast state
  const [isEmailToastOpen, setIsEmailToastOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);

  // Document history selection (for email from history)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  const allowLowMargin = can(PERMISSION_LOW_MARGIN);
  const canEditUnitPriceHt = can(PERMISSION_EDIT_UNIT_PRICE_HT);
  const canViewDetails = can(PERMISSION_VIEW_DETAILS);
  const canDeleteSale = can(PERMISSION_DELETE_SALE);

  const customersQuery = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => api.get<Customer[]>("/customers").then((r) => r.data),
  });

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateSalesDocumentTotals(lines);
  const selectedClient = (customersQuery.data ?? []).find(
    (c) => c.id === customerId,
  );
  const selectedClientType = String(
    (selectedClient as { type?: string | null } | undefined)?.type ?? "",
  );
  const form = {
    clientId: customerId,
    customerId,
    clientType: customerId ? selectedClientType : "COMPTOIR",
  };
  const isComptoir =
    form.clientType === "COMPTOIR" ||
    selectedClientType === "COMPTOIR" ||
    selectedClient?.name?.toLowerCase().includes("comptoir") ||
    String(form.clientId || form.customerId || "")
      .toLowerCase()
      .includes("comptoir") ||
    !customerId;

  // "Complétées" = au moins le nom rempli
  const isCounterInfoComplete = isComptoir && Boolean(counterClientName.trim());

  useEffect(() => {
    if (isComptoir && customerId) {
      // Named COMPTOIR client selected: auto-open panel
      setShowCounterPanel(true);
      setCounterClientErrors({});
    }
    // Implicit comptoir (!customerId) and persistent: don't auto-change panel state
  }, [isComptoir, customerId]);

  const draftData = useMemo<VenteDraft>(
    () => ({
      lines,
      customerId,
      clientInfoName,
      counterClientName,
      counterClientEmail,
      counterClientPhone,
      counterClientAddress,
      counterClientTaxId,
      counterClientNote,
      saleDate,
      activeTab,
    }),
    [
      lines,
      customerId,
      clientInfoName,
      counterClientName,
      counterClientEmail,
      counterClientPhone,
      counterClientAddress,
      counterClientTaxId,
      counterClientNote,
      saleDate,
      activeTab,
    ],
  );
  const restoreDraft = useCallback((draft: VenteDraft) => {
    setLines(
      draft.lines?.length
        ? draft.lines.map((line) =>
            recalculateSaleLine({
              ...createEmptyLine(),
              ...line,
              id: line.id || generateClientId(),
              productId: line.productId ?? null,
              quantity: Number(line.quantity) || 0,
              puHt: Number(line.puHt) || 0,
              purchasePriceHt: Number(line.purchasePriceHt) || 0,
              remisePercent: Number(line.remisePercent) || 0,
              tvaPercent: Number(line.tvaPercent) || 0,
            }),
          )
        : [createEmptyLine()],
    );
    setCustomerId(draft.customerId ?? "");
    setClientInfoName(draft.clientInfoName ?? "");
    setCounterClientName(draft.counterClientName ?? "");
    setCounterClientEmail(draft.counterClientEmail ?? "");
    setCounterClientPhone(draft.counterClientPhone ?? "");
    setCounterClientAddress(draft.counterClientAddress ?? "");
    setCounterClientTaxId(draft.counterClientTaxId ?? "");
    setCounterClientNote(draft.counterClientNote ?? "");
    setSaleDate(draft.saleDate ?? new Date().toISOString());
    if (SALES_API_DOCUMENT_TYPES.has(draft.activeTab)) setActiveTab(draft.activeTab);
  }, []);
  const isDraftEmpty = useCallback(
    (draft: VenteDraft) =>
      !draft.lines.some(isFilledLine) &&
      !draft.customerId &&
      !draft.clientInfoName.trim() &&
      !draft.counterClientName.trim() &&
      !draft.counterClientEmail.trim() &&
      !draft.counterClientPhone.trim() &&
      !draft.counterClientAddress.trim() &&
      !draft.counterClientTaxId.trim() &&
      !draft.counterClientNote.trim(),
    [],
  );
  const { clearDraft, status: draftStatus } = useFormDraft<VenteDraft>({
    key: "stockini:sales:create:draft",
    data: draftData,
    isEmpty: isDraftEmpty,
    onRestore: restoreDraft,
    debounceMs: 400,
  });

  const salesQueryParams: SalesQueryParams = {
    page: salesPage,
    limit: salesLimit,
    search: salesSearch || undefined,
    documentType: salesDocType || undefined,
    status: salesStatus || undefined,
  };

  const salesQuery = useQuery<PaginatedResponse<Sale>>({
    queryKey: [
      "stockini-sales",
      salesPage,
      salesLimit,
      salesSearch,
      salesDocType,
      salesStatus,
    ],
    queryFn: () => stockiniApi.sales(salesQueryParams),
    placeholderData: (prev) => prev,
  });
  const salesList: Sale[] = Array.isArray(salesQuery.data?.data)
    ? salesQuery.data.data
    : [];

  const docsCountQuery = useQuery({
    queryKey: ["generated-documents"],
    queryFn: () => stockiniApi.generatedDocuments(),
  });

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ["stockini-dropdown-options", "payment_methods"],
    queryFn: () =>
      api
        .get<DropdownOption[]>("/settings/dropdown-options/payment_methods")
        .then((r) => r.data),
  });

  const settingsQuery = useQuery({
    queryKey: ["stockini-settings"],
    queryFn: stockiniApi.settings,
  });
  const settings = useMemo(() => {
    const map: Record<string, string> = {};
    (settingsQuery.data ?? []).forEach((s) => {
      map[s.key] = s.value;
    });
    return map;
  }, [settingsQuery.data]);

  const invalidMarginLines = filledLines.filter(
    (l) =>
      l.productId !== null &&
      (l.purchasePriceHt <= 0 ||
        (l.margePercent !== null && l.margePercent < MIN_MARGIN_PERCENT)),
  );
  const hasMissingPurchasePrice = filledLines.some(
    (l) => l.productId !== null && l.purchasePriceHt <= 0,
  );
  const hasInvalidQuantity = filledLines.some((l) => l.quantity <= 0);
  const marginBlocked = !allowLowMargin && invalidMarginLines.length > 0;
  const canSave =
    filledLines.length > 0 &&
    !marginBlocked &&
    !hasMissingPurchasePrice &&
    !hasInvalidQuantity;

  const resetForm = (notify = false) => {
    setLines([createEmptyLine()]);
    setCustomerId("");
    setClientInfoName("");
    setCounterClientName("");
    setCounterClientEmail("");
    setCounterClientPhone("");
    setCounterClientAddress("");
    setCounterClientTaxId("");
    setCounterClientNote("");
    setCounterClientErrors({});
    setShowCounterPanel(false);
    setSaleDate(new Date().toISOString());
    clearDraft();
    if (notify) toast.success("Brouillon supprimé.");
  };

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);

    const nextClient = (customersQuery.data ?? []).find(
      (c) => c.id === nextCustomerId,
    );
    const nextClientType = String(
      (nextClient as { type?: string | null } | undefined)?.type ?? "",
    );
    const nextIsComptoir =
      !nextCustomerId ||
      nextClientType === "COMPTOIR" ||
      nextClient?.name?.toLowerCase().includes("comptoir") ||
      nextCustomerId.toLowerCase().includes("comptoir");

    if (!nextIsComptoir && nextCustomerId) {
      const clientWithTax = nextClient as
        | (typeof nextClient & { taxNumber?: string | null })
        | undefined;
      setClientInfoName(nextClient?.name ?? "");
      setCounterClientPhone(nextClient?.phone ?? "");
      setCounterClientAddress(nextClient?.address ?? "");
      setCounterClientTaxId(clientWithTax?.taxNumber ?? "");
      setCounterClientNote("");
      setCounterClientName("");
      setCounterClientEmail("");
      setCounterClientErrors({});
    } else {
      setClientInfoName("");
      setCounterClientName("");
      setCounterClientEmail("");
      setCounterClientPhone("");
      setCounterClientAddress("");
      setCounterClientTaxId("");
      setCounterClientNote("");
      setCounterClientErrors({});
    }
  };

  const handleValidate = () => {
    const missingFields: string[] = [];

    // Vérification client
    if (!customerId && !counterClientName.trim()) {
      missingFields.push(
        "Client sélectionné ou Nom client (pour vente comptoir)",
      );
    }

    // Vérification lignes produit
    if (filledLines.length === 0) {
      missingFields.push(
        "Minimum 1 ligne produit avec référence, quantité et prix > 0",
      );
    } else {
      const hasZeroPrice = filledLines.some((l) => l.puHt <= 0);
      if (hasZeroPrice)
        missingFields.push(
          "Prix unitaire doit être > 0 pour toutes les lignes",
        );
    }

    // Vérification date
    if (!saleDate) {
      missingFields.push("Date du document");
    }

    if (missingFields.length > 0) {
      toast.error(
        "Champs obligatoires manquants :\n• " + missingFields.join("\n• "),
      );
      return;
    }

    // Validation format email si saisi (comptoir)
    if (isComptoir && counterClientEmail.trim()) {
      const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailReg.test(counterClientEmail.trim())) {
        setCounterClientErrors({ counterClientEmail: "Format email invalide" });
        setShowCounterPanel(true);
        toast.error("Format email invalide");
        return;
      }
    }

    // Validation format téléphone si saisi (10 chiffres)
    if (isComptoir && counterClientPhone.trim()) {
      const phoneDigits = counterClientPhone.trim().replace(/\s/g, "");
      if (!/^\+?[0-9]{8,15}$/.test(phoneDigits)) {
        setCounterClientErrors({
          counterClientPhone: "Téléphone invalide (8–15 chiffres)",
        });
        setShowCounterPanel(true);
        toast.error("Numéro de téléphone invalide");
        return;
      }
    }

    setCounterClientErrors({});
    setShowValidateModal(true);
  };

  const createMutation = useMutation({
    mutationFn: ({
      docType,
      paid,
      method,
    }: {
      docType: SalesDocumentType;
      paid: number;
      method: string;
    }) => {
      if (filledLines.length === 0) {
        throw new Error(
          "Ajoutez au moins une ligne produit avant d'enregistrer",
        );
      }
      const missingProduct = filledLines.find((l) => l.productId === null);
      if (missingProduct) {
        throw new Error(
          `La ligne "${missingProduct.designation || missingProduct.reference}" n'est pas liée à un produit du stock`,
        );
      }
      if (hasMissingPurchasePrice) {
        throw new Error(
          "Vente bloquée : un ou plusieurs produits n'ont pas de prix d'achat défini.",
        );
      }
      if (hasInvalidQuantity) {
        throw new Error(
          "La quantité doit être supérieure à 0 pour chaque ligne.",
        );
      }
      if (!allowLowMargin && invalidMarginLines.length > 0) {
        throw new Error(
          "Vous n'avez pas le droit de valider cette vente. La marge minimale autorisée est de 20%.",
        );
      }
      if (!SALES_DOCUMENT_TYPES.has(docType)) {
        throw new Error(`Type de document invalide: ${docType}`);
      }
      if (!SALES_API_DOCUMENT_TYPES.has(docType)) {
        throw new Error("Les avoirs doivent être créés depuis l'onglet Avoir.");
      }
      const paymentAllowed =
        docType === "FACTURE" || docType === "BON_LIVRAISON";
      const submittedPaidAmount = paymentAllowed ? round3(paid) : 0;
      if (submittedPaidAmount > round3(totals.totalTtc) + 0.001) {
        throw new Error("Le montant payé ne peut pas dépasser le total TTC.");
      }
      if (submittedPaidAmount > 0 && !method) {
        throw new Error("Veuillez sélectionner une méthode de paiement.");
      }
      const trimmedName = counterClientName.trim();
      const trimmedEmail = counterClientEmail.trim();
      const trimmedPhone = counterClientPhone.trim();
      const trimmedAddress = counterClientAddress.trim();

      return api
        .post<Sale>("/sales", {
          documentType: docType,
          customerId: customerId || undefined,
          clientType: isComptoir ? "COMPTOIR" : "PERSISTENT",
          counterClientFirstName: null,
          counterClientLastName: isComptoir ? trimmedName || null : null,
          counterClientFullName: isComptoir
            ? trimmedName || null
            : clientInfoName.trim() || null,
          counterClientEmail: trimmedEmail || null,
          counterClientPhone: trimmedPhone || null,
          counterClientAddress: trimmedAddress || null,
          counterClientTaxId: counterClientTaxId.trim() || null,
          counterClientNote: counterClientNote.trim() || null,
          paidAmount: submittedPaidAmount,
          paymentMethod: submittedPaidAmount > 0 && method ? method : undefined,
          items: filledLines.map((l) => ({
            productId: l.productId!,
            designation: l.designation.trim() || undefined,
            quantity: l.quantity,
            unitPrice: round3(l.puHt),
            discountPercent: l.remisePercent,
            marginPercent: l.defaultMarginPercent,
          })),
        })
        .then((r) => r.data);
    },
    onSuccess: (newSale) => {
      queryClient.invalidateQueries({ queryKey: ["stockini-sales"] });
      queryClient.invalidateQueries({ queryKey: ["stockini-products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (Number((newSale as { paidAmount?: unknown }).paidAmount) > 0) {
        queryClient.invalidateQueries({ queryKey: ["caisse-summary"] });
        queryClient.invalidateQueries({ queryKey: ["caisse-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["caisse-analytics"] });
      }
      const typeLabel =
        DOC_TYPE_SHORT[(newSale as { documentType: string }).documentType] ??
        "Document";
      const num = (newSale as { invoiceNumber: string }).invoiceNumber ?? "";
      toast.success(`Document ${typeLabel} N°${num} enregistré`);
      setShowValidateModal(false);
      clearDraft();
      resetForm();
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        toast.error(error.message);
        return;
      }
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg[0]
        : (msg ?? "Erreur lors de l'enregistrement");
      toast.error(text);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stockini-sales"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["caisse-summary"] });
      toast.success("Vente déplacée dans la corbeille");
      setDeleteTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg[0]
        : (msg ?? "Erreur lors du déplacement dans la corbeille");
      toast.error(text);
      setDeleteTarget(null);
    },
  });

  const transformMutation = useMutation({
    mutationFn: ({
      id,
      targetType,
    }: {
      id: string;
      targetType: SalesDocumentType;
    }) => stockiniApi.transformSale(id, targetType),
    onSuccess: (newSale) => {
      queryClient.invalidateQueries({ queryKey: ["stockini-sales"] });
      queryClient.invalidateQueries({ queryKey: ["stockini-products"] });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
      const label =
        ALL_TRANSFORM_OPTIONS.find((o) => o.type === newSale.documentType)
          ?.label ?? newSale.documentType;
      toast.success(`Document transformé en ${label} !`);
      setTransformTarget(null);
      setSelectedInvoiceIds([]);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? "Erreur lors de la transformation");
    },
  });

  // ── Checkbox toggle: only updates selection, never opens panels ──────────
  const toggleInvoiceSelection = (saleId: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = prev.includes(saleId)
        ? prev.filter((id) => id !== saleId)
        : [...prev, saleId];

      if (next.length === 0) {
        setIsEmailToastOpen(false);
        setEmailPreview(null);
        setIsDocMenuOpen(false);
      }

      return next;
    });
  };

  // Builds email preview state without opening the toast
  const loadEmailPreview = async (invoiceIds: string[]) => {
    setEmailPreviewLoading(true);
    try {
      const docs = await stockiniApi.generatedDocuments();
      const relevantDocs = docs.filter((d) => invoiceIds.includes(d.invoiceId));

      if (relevantDocs.length > 0) {
        const preview = await stockiniApi.emailPreview(
          relevantDocs.map((d) => d.id),
        );
        setEmailPreview(preview);
      } else {
        const sales = salesList;
        const selectedSales = sales.filter((s) => invoiceIds.includes(s.id));
        const clientNames = new Set(
          selectedSales
            .map((s) => s.customer?.name ?? "Client comptoir")
            .filter(Boolean),
        );
        const clientEmails = new Set(
          selectedSales.map((s) => s.customer?.email ?? "").filter(Boolean),
        );

        if (clientNames.size > 1 || clientEmails.size > 1) {
          setEmailPreview({
            to: "",
            subject: "__multi_client__",
            body: "",
            attachments: [],
          });
        } else {
          const clientName = [...clientNames][0] ?? "Client";
          const clientEmail = [...clientEmails][0] ?? "";
          setEmailPreview({
            to: clientEmail,
            subject: `Documents commerciaux - ${clientName}`,
            body: `Bonjour ${clientName},\n\nVeuillez trouver en pièces jointes les documents demandés.\n\nCordialement.`,
            attachments: [],
          });
        }
      }
    } catch {
      // silent fail on preview load
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  // ── Download button: opens document generation panel ─────────────────────
  const handleDownloadClick = () => {
    if (selectedInvoiceIds.length === 0) {
      toast.info("Veuillez sélectionner au moins une facture.");
      return;
    }
    setIsEmailToastOpen(false);
    setEmailPreview(null);
    setIsDocMenuOpen(true);
  };

  // ── Email button: opens email panel only on explicit click ────────────────
  const handleEmailClick = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setIsDocMenuOpen(false);
    await loadEmailPreview(selectedInvoiceIds);
    setIsEmailToastOpen(true);
  };

  const handleGenerateDocument = async (type: SalesDocumentType) => {
    setDocMenuGenerating(type);
    try {
      const result = await stockiniApi.generateDocuments(
        selectedInvoiceIds,
        type,
      );
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setIsDocMenuOpen(false);
      toast.success(
        `${result.documents.length} document(s) généré(s) avec succès`,
        {
          label: "Voir dans Documents",
          onClick: () => router.push("/documents"),
        },
      );
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? "Erreur lors de la génération du document");
    } finally {
      setDocMenuGenerating(null);
    }
  };

  const handleEmailForRow = async (sale: Sale) => {
    setIsDocMenuOpen(false);
    setSelectedInvoiceIds([sale.id]);
    await loadEmailPreview([sale.id]);
    setIsEmailToastOpen(true);
  };

  // ── Document selection from history — only tracks state, never auto-opens ──
  const handleDocumentSelectionChange = (ids: string[]) => {
    setSelectedDocumentIds(ids);
    if (ids.length === 0 && selectedInvoiceIds.length === 0) {
      setIsEmailToastOpen(false);
      setEmailPreview(null);
    }
  };

  // ── Email button for document history: opens email panel explicitly ────────
  const handleDocumentEmailClick = async () => {
    if (selectedDocumentIds.length === 0) return;
    setIsDocMenuOpen(false);
    setEmailPreviewLoading(true);
    try {
      const preview = await stockiniApi.emailPreview(selectedDocumentIds);
      setEmailPreview(preview);
      setIsEmailToastOpen(true);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (msg?.includes("même client")) {
        setEmailPreview({
          to: "",
          subject: "__multi_client__",
          body: "",
          attachments: [],
        });
        setIsEmailToastOpen(true);
      } else {
        toast.error(msg ?? "Erreur lors de la préparation de l'email");
      }
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  // ── Send email ─────────────────────────────────────────────────────────────
  const handleSendEmail = async (payload: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
  }) => {
    const docIds =
      selectedDocumentIds.length > 0
        ? selectedDocumentIds
        : await (async () => {
            const docs = await stockiniApi.generatedDocuments();
            return docs
              .filter((d) => selectedInvoiceIds.includes(d.invoiceId))
              .map((d) => d.id);
          })();

    if (!docIds.length) {
      toast.info(
        "Aucun document généré à envoyer. Générez d'abord les documents.",
      );
      return;
    }

    setIsSendingEmail(true);
    try {
      await stockiniApi.sendDocumentEmail({ documentIds: docIds, ...payload });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
      toast.success("Email envoyé avec succès.");
      setIsEmailToastOpen(false);
      setSelectedInvoiceIds([]);
      setSelectedDocumentIds([]);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? "Échec de l'envoi email");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const today = saleDate
    ? new Date(saleDate).toLocaleDateString("fr-TN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const hasActions = true; // always show: kebab always has at minimum Envoyer
  const colSpan = 1 + 7 + (hasActions ? 1 : 0);

  return (
    <PermissionGuard permission="sales.view">
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="app-page-title">Ventes</h1>
          <p className="app-page-subtitle">
            Enregistrement des ventes et documents commerciaux
          </p></div>
          {draftStatus !== "idle" && (
            <span className="text-xs text-text-muted" role="status">
              {draftStatus === "restored" ? "Brouillon restauré" : "Brouillon sauvegardé"}
            </span>
          )}
        </div>

        {/* Tab selector — 5 document types */}
        <div className="rounded-lg border border-border/70 bg-white p-1.5 flex flex-wrap gap-1.5 overflow-x-auto">
          {DOC_TAB_CONFIG.map(
            ({ id, label, Icon, activeClass, hoverClass }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === id ? activeClass : hoverClass
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ),
          )}
        </div>

        {/* Avoir page — rendered when Avoir tab is active */}
        {activeTab === "AVOIR" && <AvoirPage />}

        {/* All content below only shown on non-Avoir tabs */}
        {activeTab !== "AVOIR" && (
          <>
            {/* Document header: client + date */}
            <div className="rounded-lg border border-border/70 bg-white p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[2fr_120px] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sale-customer">Client</Label>
                  <select
                    id="sale-customer"
                    value={customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="app-select"
                  >
                    <option value="">Client comptoir</option>
                    {customerId && customersQuery.isSuccess && !(customersQuery.data ?? []).some((c) => c.id === customerId) && (
                      <option value={customerId}>Client indisponible (brouillon)</option>
                    )}
                    {(customersQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-text-secondary whitespace-nowrap">
                    {today}
                  </div>
                </div>
              </div>

              {/* Client info panel — always visible (comptoir implicit when no client, or any selected client) */}
              {(isComptoir || customerId) && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowCounterPanel((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      isComptoir
                        ? isCounterInfoComplete
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <UserCircle size={15} />
                      {isComptoir
                        ? "Compléter infos client (optionnel)"
                        : "Informations client"}
                      {isComptoir && (
                        <span
                          className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isCounterInfoComplete
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {isCounterInfoComplete
                            ? "Infos complétées"
                            : "Infos minimales"}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${showCounterPanel ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showCounterPanel && (
                    <div className="rounded-lg border border-border bg-slate-50 p-4 space-y-3">
                      {isComptoir ? (
                        <>
                          <p className="text-xs text-text-muted">
                            Informations optionnelles — l'enregistrement est
                            possible sans les remplir.
                          </p>
                          {/* Nom client + Email (affichés en priorité) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="ccf-name" className="text-xs">
                                Nom client *
                              </Label>
                              <Input
                                id="ccf-name"
                                value={counterClientName}
                                onChange={(e) => {
                                  setCounterClientName(e.target.value);
                                  if (counterClientErrors.counterClientName) {
                                    setCounterClientErrors((p) => ({
                                      ...p,
                                      counterClientName: "",
                                    }));
                                  }
                                }}
                                placeholder="Nom complet"
                                className={`h-8 text-sm ${counterClientErrors.counterClientName ? "border-red-400" : ""}`}
                              />
                              {counterClientErrors.counterClientName && (
                                <p className="text-xs text-red-500">
                                  {counterClientErrors.counterClientName}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="ccf-email" className="text-xs">
                                Email
                              </Label>
                              <Input
                                id="ccf-email"
                                type="email"
                                value={counterClientEmail}
                                onChange={(e) => {
                                  setCounterClientEmail(e.target.value);
                                  if (counterClientErrors.counterClientEmail) {
                                    setCounterClientErrors((p) => ({
                                      ...p,
                                      counterClientEmail: "",
                                    }));
                                  }
                                }}
                                placeholder="client@email.com"
                                className={`h-8 text-sm ${counterClientErrors.counterClientEmail ? "border-red-400" : ""}`}
                              />
                              {counterClientErrors.counterClientEmail && (
                                <p className="text-xs text-red-500">
                                  {counterClientErrors.counterClientEmail}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Champs optionnels */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="ccf-phone" className="text-xs">
                                Téléphone
                              </Label>
                              <Input
                                id="ccf-phone"
                                value={counterClientPhone}
                                onChange={(e) => {
                                  setCounterClientPhone(e.target.value);
                                  if (counterClientErrors.counterClientPhone) {
                                    setCounterClientErrors((p) => ({
                                      ...p,
                                      counterClientPhone: "",
                                    }));
                                  }
                                }}
                                placeholder="+216 xx xxx xxx"
                                className={`h-8 text-sm ${counterClientErrors.counterClientPhone ? "border-red-400" : ""}`}
                              />
                              {counterClientErrors.counterClientPhone && (
                                <p className="text-xs text-red-500">
                                  {counterClientErrors.counterClientPhone}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="ccf-taxId" className="text-xs">
                                Matricule fiscal (MF)
                              </Label>
                              <Input
                                id="ccf-taxId"
                                value={counterClientTaxId}
                                onChange={(e) =>
                                  setCounterClientTaxId(e.target.value)
                                }
                                placeholder="MF optionnel"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="ccf-address" className="text-xs">
                              Adresse
                            </Label>
                            <Input
                              id="ccf-address"
                              value={counterClientAddress}
                              onChange={(e) =>
                                setCounterClientAddress(e.target.value)
                              }
                              placeholder="Adresse complète"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="ccf-note" className="text-xs">
                              Note (optionnel)
                            </Label>
                            <Input
                              id="ccf-note"
                              value={counterClientNote}
                              onChange={(e) =>
                                setCounterClientNote(e.target.value)
                              }
                              placeholder="Note libre"
                              className="h-8 text-sm"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-text-muted">
                            Modifiable pour cette vente uniquement — la fiche
                            client reste inchangée.
                          </p>
                          <div className="space-y-1">
                            <Label htmlFor="cif-name" className="text-xs">
                              Nom / Société
                            </Label>
                            <Input
                              id="cif-name"
                              value={clientInfoName}
                              onChange={(e) =>
                                setClientInfoName(e.target.value)
                              }
                              placeholder="Nom ou société"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="cif-phone" className="text-xs">
                                Téléphone
                              </Label>
                              <Input
                                id="cif-phone"
                                value={counterClientPhone}
                                onChange={(e) =>
                                  setCounterClientPhone(e.target.value)
                                }
                                placeholder="+216 xx xxx xxx"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="cif-taxId" className="text-xs">
                                Matricule fiscal (MF)
                              </Label>
                              <Input
                                id="cif-taxId"
                                value={counterClientTaxId}
                                onChange={(e) =>
                                  setCounterClientTaxId(e.target.value)
                                }
                                placeholder="MF optionnel"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="cif-address" className="text-xs">
                              Adresse
                            </Label>
                            <Input
                              id="cif-address"
                              value={counterClientAddress}
                              onChange={(e) =>
                                setCounterClientAddress(e.target.value)
                              }
                              placeholder="Adresse complète"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="cif-note" className="text-xs">
                              Note (optionnel)
                            </Label>
                            <Input
                              id="cif-note"
                              value={counterClientNote}
                              onChange={(e) =>
                                setCounterClientNote(e.target.value)
                              }
                              placeholder="Note libre"
                              className="h-8 text-sm"
                            />
                          </div>
                        </>
                      )}
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCounterPanel(false)}
                        >
                          Masquer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Register grid */}
            <ProductRegisterGrid
              lines={lines}
              hasLowMarginPermission={allowLowMargin}
              canEditUnitPriceHt={canEditUnitPriceHt}
              onLinesChange={setLines}
            />

            {/* Margin warning banner */}
            {(marginBlocked || hasMissingPurchasePrice) && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-bold">⚠</span>
                <span>
                  {hasMissingPurchasePrice
                    ? "Vente bloquée : un ou plusieurs produits n'ont pas de prix d'achat défini."
                    : "Vous n'avez pas le droit de valider cette vente. La marge minimale autorisée est de 20%."}
                </span>
              </div>
            )}

            {/* Payment info banner — shown for doc types that don't accept payment */}
            {(() => {
              const cfg = DOC_TAB_CONFIG.find((t) => t.id === activeTab);
              return cfg && !cfg.acceptsPayment ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                  Paiement disponible uniquement pour{" "}
                  <strong>Bon de livraison</strong> et <strong>Facture</strong>.
                </div>
              ) : null;
            })()}

            {/* Save action */}
            <div className="rounded-lg border border-border/70 bg-white p-4">
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => resetForm(true)}
                >
                  Réinitialiser
                </Button>
                {can("sales.create") && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleValidate}
                    disabled={!canSave || createMutation.isPending}
                  >
                    {DOC_TAB_CONFIG.find((t) => t.id === activeTab)
                      ?.saveLabel ?? "Valider"}
                  </Button>
                )}
              </div>
            </div>

            {/* History tabs */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Tab bar */}
              <div className="flex items-center justify-between border-b-2 border-slate-200">
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab("ventes")}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-all -mb-px",
                      activeHistoryTab === "ventes"
                        ? "border-orange-500 bg-white font-semibold text-slate-900"
                        : "border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                    )}
                  >
                    Historique des ventes
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        activeHistoryTab === "ventes"
                          ? "bg-orange-500 text-white"
                          : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {salesQuery.data?.total ?? salesList.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab("documents")}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-all -mb-px",
                      activeHistoryTab === "documents"
                        ? "border-orange-500 bg-white font-semibold text-slate-900"
                        : "border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                    )}
                  >
                    Historique des documents générés
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        activeHistoryTab === "documents"
                          ? "bg-orange-500 text-white"
                          : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {docsCountQuery.data?.length ?? 0}
                    </span>
                  </button>
                </div>
                {/* Right side actions */}
                <div className="px-3 flex items-center gap-2">
                  {activeHistoryTab === "ventes" && (
                    <>
                      <button
                        type="button"
                        onClick={handleDownloadClick}
                        disabled={selectedInvoiceIds.length === 0}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium",
                          "border border-orange-200/70 bg-orange-50 text-orange-700",
                          "transition-all duration-150",
                          "hover:-translate-y-px hover:border-orange-300 hover:bg-orange-100",
                          "disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                      >
                        <Download size={12} />
                        Générer
                      </button>
                      {selectedInvoiceIds.length > 0 && (
                        <BulkActionsBar
                          count={selectedInvoiceIds.length}
                          onEmail={handleEmailClick}
                          emailLoading={emailPreviewLoading}
                          onClear={() => setSelectedInvoiceIds([])}
                          transformButton={(() => {
                            if (selectedInvoiceIds.length !== 1) return null;
                            const sel = salesList.find(
                              (s) => s.id === selectedInvoiceIds[0],
                            );
                            if (
                              !sel ||
                              !(TRANSFORMABLE_TYPES as string[]).includes(
                                sel.documentType,
                              ) ||
                              sel.transformedToId ||
                              sel.status === "CANCELLED"
                            )
                              return null;
                            return (
                              <TransformDropdownButton
                                sale={sel}
                                onSelect={(targetType) =>
                                  setTransformTarget({ sale: sel, targetType })
                                }
                              />
                            );
                          })()}
                        />
                      )}
                    </>
                  )}
                  {activeHistoryTab === "documents" &&
                    selectedDocumentIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDocumentEmailClick}
                        disabled={emailPreviewLoading}
                        className="flex items-center gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        <Mail size={14} />
                        Envoyer par email ({selectedDocumentIds.length})
                      </Button>
                    )}
                </div>
              </div>

              {activeHistoryTab === "ventes" && (
                <>
                  <HistoryToolbar
                    search={salesLocalSearch}
                    onSearch={handleSalesSearchChange}
                    searchPlaceholder="Rechercher facture, client…"
                    filters={[
                      {
                        key: "docType",
                        type: "select",
                        options: [
                          { value: "", label: "Tous les types" },
                          { value: "DEVIS", label: "Devis" },
                          { value: "BON_COMMANDE", label: "Bon de commande" },
                          { value: "BON_LIVRAISON", label: "Bon de livraison" },
                          { value: "FACTURE", label: "Facture" },
                        ],
                      },
                      {
                        key: "status",
                        type: "select",
                        options: [
                          { value: "", label: "Tous les statuts" },
                          { value: "DRAFT", label: "Brouillon" },
                          { value: "COMPLETED", label: "Terminée" },
                          { value: "CANCELLED", label: "Annulée" },
                        ],
                      },
                    ]}
                    filterValues={{
                      docType: salesDocType,
                      status: salesStatus,
                    }}
                    onFilterChange={(key, value) => {
                      if (key === "docType") {
                        setSalesDocType(value);
                        setSalesPage(1);
                      }
                      if (key === "status") {
                        setSalesStatus(value);
                        setSalesPage(1);
                      }
                    }}
                    resultsCount={salesQuery.data?.total ?? 0}
                    onReset={() => {
                      handleSalesSearchChange("");
                      setSalesDocType("");
                      setSalesStatus("");
                      setSalesPage(1);
                    }}
                    isFetching={salesQuery.isFetching}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50">
                        <tr>
                          <th className="w-10 px-3 py-2.5 text-center">
                            <span className="sr-only">Sélection</span>
                          </th>
                          {[
                            "Facture",
                            "Client",
                            "Date",
                            "Articles",
                            "Total TTC",
                            "Paiement",
                            "Statut",
                            ...(hasActions ? ["Actions"] : []),
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {salesQuery.isLoading ? (
                          <tr>
                            <td
                              colSpan={colSpan}
                              className="px-4 py-10 text-center text-sm text-slate-400"
                            >
                              Chargement…
                            </td>
                          </tr>
                        ) : salesList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={colSpan}
                              className="px-4 py-10 text-center text-sm text-slate-400"
                            >
                              Aucune vente enregistrée
                            </td>
                          </tr>
                        ) : (
                          salesList.map((sale) => {
                            const isSelected = selectedInvoiceIds.includes(
                              sale.id,
                            );
                            return (
                              <tr
                                key={sale.id}
                                className={cn(
                                  "transition-colors duration-100",
                                  isSelected
                                    ? "bg-orange-50/70 hover:bg-orange-50"
                                    : "hover:bg-slate-50/80",
                                )}
                              >
                                {/* Checkbox */}
                                <td className="px-3 py-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() =>
                                      toggleInvoiceSelection(sale.id)
                                    }
                                    className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-orange-500"
                                    aria-label={`Sélectionner la vente ${sale.invoiceNumber}`}
                                  />
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-mono text-xs font-semibold text-slate-800">
                                      {sale.invoiceNumber}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span
                                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${DOC_TYPE_BADGE[sale.documentType] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                                      >
                                        {DOC_TYPE_SHORT[sale.documentType] ??
                                          sale.documentType}
                                      </span>
                                      {sale.transformedToId && (
                                        <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                                          Transformé ›
                                        </span>
                                      )}
                                      {sale.sourceDocumentId &&
                                        !sale.transformedToId && (
                                          <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                            Issu d'une transf.
                                          </span>
                                        )}
                                      {(sale.status === "PARTIALLY_REFUNDED" ||
                                        sale.status === "REFUNDED") && (
                                        <span
                                          className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                            sale.status === "REFUNDED"
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-amber-200 bg-amber-50 text-amber-700"
                                          }`}
                                        >
                                          <RotateCcw size={9} />
                                          {sale.status === "REFUNDED"
                                            ? "Avoir total"
                                            : "Avoir partiel"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-[13px] text-slate-600">
                                  {sale.customer?.name ?? "Comptoir"}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-slate-500">
                                  {new Date(sale.createdAt).toLocaleDateString(
                                    "fr-TN",
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs text-slate-500">
                                  {sale.items?.length ?? 0}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums">
                                  <span className="font-medium text-slate-800">
                                    {money(sale.totalCurrentTtc ?? sale.total)}
                                  </span>
                                  {sale.totalCurrentTtc != null &&
                                    Number(sale.totalCurrentTtc) < Number(sale.total) && (
                                      <span className="ml-1 text-[11px] text-slate-400 line-through">
                                        {money(sale.total)}
                                      </span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {(() => {
                                    const pd = getPaymentDisplay(
                                      sale.documentType,
                                      sale.paymentStatus,
                                    );
                                    return (
                                      <span
                                        className={`app-status-badge ${pd.className}`}
                                      >
                                        {pd.label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`app-status-badge ${STATUS_COLORS[sale.status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}
                                  >
                                    {SALE_STATUS_LABELS[sale.status] ??
                                      sale.status}
                                  </span>
                                </td>
                                {hasActions && (
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-1.5 justify-end">
                                      <KebabMenu
                                        items={[
                                          {
                                            label: "Envoyer",
                                            icon: <Mail size={14} />,
                                            onClick: () =>
                                              handleEmailForRow(sale),
                                          },
                                          {
                                            divider: true,
                                            hidden:
                                              !canViewDetails &&
                                              !canDeleteSale,
                                          },
                                          {
                                            label: "Voir les détails",
                                            icon: <Eye size={14} />,
                                            onClick: () =>
                                              setSelectedSaleId(sale.id),
                                            hidden: !canViewDetails,
                                          },
                                          {
                                            divider: true,
                                            hidden:
                                              !canViewDetails ||
                                              !canDeleteSale,
                                          },
                                          {
                                            label: "Mettre à la corbeille",
                                            icon: <Trash2 size={14} />,
                                            onClick: () =>
                                              setDeleteTarget(sale),
                                            variant: "destructive",
                                            hidden: !canDeleteSale,
                                          },
                                        ]}
                                      />
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-slate-400">
                        Lignes&nbsp;:
                      </span>
                      <select
                        value={salesLimit}
                        onChange={(e) => {
                          setSalesLimit(Number(e.target.value));
                          setSalesPage(1);
                        }}
                        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400/25 hover:border-slate-300 transition-colors"
                      >
                        {[5, 10, 20, 30, 100].map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      {(salesQuery.data?.total ?? 0) > 0 && (
                        <span className="text-[12px] text-slate-400">
                          {(salesPage - 1) * salesLimit + 1}–
                          {Math.min(
                            salesPage * salesLimit,
                            salesQuery.data?.total ?? 0,
                          )}{" "}
                          sur {salesQuery.data?.total ?? 0}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSalesPage((p) => p - 1)}
                          disabled={salesPage <= 1 || salesQuery.isFetching}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Page précédente"
                        >
                          <ChevronLeft size={13} />
                        </button>
                        <span className="min-w-[76px] text-center text-[12px] font-medium text-slate-600">
                          Page {salesPage} /{" "}
                          {Math.max(salesQuery.data?.totalPages ?? 1, 1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSalesPage((p) => p + 1)}
                          disabled={
                            salesPage >= (salesQuery.data?.totalPages ?? 1) ||
                            salesQuery.isFetching
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Page suivante"
                        >
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {activeHistoryTab === "documents" && (
                <GeneratedDocumentsHistory
                  noHeader
                  selectedDocumentIds={selectedDocumentIds}
                  onDocumentSelectionChange={handleDocumentSelectionChange}
                  onEmailClick={handleDocumentEmailClick}
                  emailLoading={emailPreviewLoading}
                />
              )}
            </div>

            {/* Floating document generation panel (opened by Download button) */}
            {isDocMenuOpen && (
              <div className="fixed bottom-6 right-6 z-40 w-64 rounded-xl border border-border/70 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                <div className="flex items-center justify-between bg-primary/5 border-b border-border/60 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                      Générer un document
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {selectedInvoiceIds.length} vente
                      {selectedInvoiceIds.length > 1 ? "s" : ""} sélectionnée
                      {selectedInvoiceIds.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDocMenuOpen(false)}
                    className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary transition-colors"
                    aria-label="Fermer"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-3 space-y-1.5">
                  {PDF_ACTIONS.map((action) => (
                    <button
                      key={action.type}
                      type="button"
                      disabled={docMenuGenerating !== null}
                      onClick={() => handleGenerateDocument(action.type)}
                      className="w-full flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {docMenuGenerating === action.type ? (
                        <Loader2
                          size={14}
                          className="shrink-0 animate-spin text-primary"
                        />
                      ) : (
                        <FileText
                          size={14}
                          className="shrink-0 text-primary/70"
                        />
                      )}
                      {action.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border/60 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setIsDocMenuOpen(false)}
                    className="w-full rounded-md py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Email toast — visible when invoices or documents are selected */}
            {isEmailToastOpen && emailPreview && !emailPreviewLoading && (
              <EmailToast
                preview={emailPreview}
                isSending={isSendingEmail}
                onSend={handleSendEmail}
                onCancel={() => {
                  setIsEmailToastOpen(false);
                  setSelectedInvoiceIds([]);
                  setSelectedDocumentIds([]);
                }}
              />
            )}

            {/* Sale details modal */}
            {selectedSaleId && (
              <SaleDetailsModal
                saleId={selectedSaleId}
                onClose={() => setSelectedSaleId(null)}
              />
            )}

            {/* Transform confirm modal — opened from TransformDropdownButton in bulk bar */}
            {transformTarget && (
              <TransformConfirmModal
                sale={transformTarget.sale}
                targetType={transformTarget.targetType}
                isPending={transformMutation.isPending}
                onConfirm={() =>
                  transformMutation.mutate({
                    id: transformTarget.sale.id,
                    targetType: transformTarget.targetType,
                  })
                }
                onCancel={() => setTransformTarget(null)}
              />
            )}

            {/* Validate document modal — confirms the active tab type + optional payment */}
            {showValidateModal && (
              <ValidateDocumentModal
                docType={activeTab}
                isPending={createMutation.isPending}
                paymentMethods={paymentMethodsQuery.data ?? []}
                totals={totals}
                onConfirm={(paid, method) =>
                  createMutation.mutate({ docType: activeTab, paid, method })
                }
                onCancel={() => setShowValidateModal(false)}
              />
            )}

            {deleteTarget && (
              <MoveToTrashDialog
                label={deleteTarget.invoiceNumber}
                isPending={cancelMutation.isPending}
                onConfirm={() => cancelMutation.mutate(deleteTarget.id)}
                onCancel={() => setDeleteTarget(null)}
              />
            )}
          </>
        )}
      </div>
    </PermissionGuard>
  );
}
