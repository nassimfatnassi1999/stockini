import { statusLabel } from '@/lib/stockini/format';

export const FALLBACK_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  customer_types: [
    { value: 'INDIVIDUAL', label: 'Passager' },
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
