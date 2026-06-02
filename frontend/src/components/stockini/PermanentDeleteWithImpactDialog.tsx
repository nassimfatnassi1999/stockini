'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';
import { stockiniApi } from '@/lib/stockini/api';
import type { DeleteImpactResult, TrashEntityType, TrashItem } from '@/lib/stockini/types';

const CONFIRM_KEYWORD = 'SUPPRIMER';

const RISK_CONFIG = {
  LOW: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle2 },
  MEDIUM: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
  HIGH: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: ShieldAlert },
};

const ENTITY_LABELS: Record<TrashEntityType, string> = {
  product: 'Produit',
  customer: 'Client',
  supplier: 'Fournisseur',
  sale: 'Vente',
  purchase: 'Achat',
  payment: 'Paiement',
  document: 'Document',
};

interface Props {
  item: TrashItem;
  isPending: boolean;
  onConfirm: (confirmCascade: boolean) => void;
  onCancel: () => void;
}

export function PermanentDeleteWithImpactDialog({ item, isPending, onConfirm, onCancel }: Props) {
  const [cascadeChecked, setCascadeChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const { data: impact, isLoading, isError } = useQuery<DeleteImpactResult>({
    queryKey: ['trash-impact', item.entity, item.id],
    queryFn: () => stockiniApi.previewTrashDeleteImpact(item.entity, item.id),
    staleTime: 0,
    retry: false,
  });

  const riskConf = impact ? RISK_CONFIG[impact.riskLevel] : null;
  const RiskIcon = riskConf?.icon ?? Info;

  const canConfirm = impact
    ? impact.canDelete &&
      (!impact.requiresCascadeConfirmation ||
        (cascadeChecked && confirmText.trim() === CONFIRM_KEYWORD))
    : false;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(impact?.requiresCascadeConfirmation ? cascadeChecked : false);
  }

  const subtitle = impact
    ? `${ENTITY_LABELS[item.entity]} — ${impact.mainEntity}`
    : `${ENTITY_LABELS[item.entity]} — ${item.reference || item.name}`;

  return (
    <SlideOver
      title="Suppression définitive"
      subtitle={subtitle}
      open={true}
      onClose={onCancel}
      width={500}
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </Button>
          {impact?.canDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleConfirm}
              disabled={!canConfirm || isPending}
            >
              {isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Suppression…</>
              ) : (
                <><Trash2 size={14} /> Confirmer la suppression</>
              )}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-text-muted">
            <Loader2 size={22} className="animate-spin text-text-muted" />
            Analyse des dépendances…
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle size={22} className="text-red-500" />
            <p className="text-sm text-red-600">
              Impossible de calculer l'impact de la suppression.
            </p>
          </div>
        )}

        {/* Impact result */}
        {impact && (
          <>
            {/* Risk badge */}
            {riskConf && (
              <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${riskConf.bg} ${riskConf.border}`}>
                <RiskIcon size={16} className={`mt-0.5 shrink-0 ${riskConf.color}`} />
                <div className="space-y-0.5">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${riskConf.color}`}>
                    Risque {impact.riskLevel === 'LOW' ? 'faible' : impact.riskLevel === 'MEDIUM' ? 'modéré' : 'élevé'}
                  </p>
                  {impact.warning && (
                    <p className={`text-xs ${riskConf.color}`}>{impact.warning}</p>
                  )}
                </div>
              </div>
            )}

            {/* Hard block */}
            {!impact.canDelete && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700">Suppression bloquée</p>
                <p className="mt-1 text-xs text-red-600">
                  Cet élément ne peut pas être supprimé définitivement car il est lié à des données actives.
                </p>
              </div>
            )}

            {/* Blocking relations */}
            {impact.blockingRelations.length > 0 && (
              <Section title="Dépendances bloquantes" icon="🔗" colorClass="text-red-600">
                <ul className="mt-1 space-y-1">
                  {impact.blockingRelations.map((rel) => (
                    <li key={rel} className="flex items-center gap-2 text-xs text-red-700">
                      <span className="h-1 w-1 rounded-full bg-red-400 shrink-0" />
                      {rel}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Cascade delete list */}
            {impact.cascadeWouldDelete.length > 0 && (
              <Section title="Sera supprimé en cascade" icon="🗑️" colorClass="text-amber-700">
                <ul className="mt-1 space-y-1">
                  {impact.cascadeWouldDelete.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-amber-700">
                      <span className="h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Will keep */}
            {impact.willKeep.length > 0 && (
              <Section title="Conservé" icon="✅" colorClass="text-green-700">
                <ul className="mt-1 space-y-1">
                  {impact.willKeep.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-green-700">
                      <span className="h-1 w-1 rounded-full bg-green-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* No dependencies — safe delete */}
            {impact.canDelete && !impact.requiresCascadeConfirmation && impact.cascadeWouldDelete.length === 0 && (
              <p className="text-xs text-text-muted text-center py-2">
                Aucune dépendance détectée. Cette suppression est sûre.
              </p>
            )}

            {/* Cascade confirmation fields */}
            {impact.canDelete && impact.requiresCascadeConfirmation && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
                <p className="text-xs font-semibold text-red-700">
                  Confirmation requise
                </p>

                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-red-600"
                    checked={cascadeChecked}
                    onChange={(e) => setCascadeChecked(e.target.checked)}
                  />
                  <span className="text-xs text-red-700 leading-snug">
                    Je comprends que les données liées listées ci-dessus seront définitivement supprimées et que cette action est irréversible.
                  </span>
                </label>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-red-700">
                    Tapez <span className="font-mono font-bold">{CONFIRM_KEYWORD}</span> pour confirmer :
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_KEYWORD}
                    className="w-full rounded-md border border-red-300 bg-white px-3 py-1.5 font-mono text-xs text-red-800 placeholder:text-red-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SlideOver>
  );
}

function Section({
  title,
  icon,
  colorClass,
  children,
}: {
  title: string;
  icon: string;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface p-3">
      <p className={`text-xs font-semibold ${colorClass} flex items-center gap-1.5`}>
        <span>{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}
