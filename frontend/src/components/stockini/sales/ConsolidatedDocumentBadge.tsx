export function ConsolidatedDocumentBadge({ reference, parent = false }: { reference?: string | null; parent?: boolean }) {
  return (
    <span className="inline-flex rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
      {parent ? 'Consolidé' : reference ? `Inclus dans ${reference}` : 'Regroupé'}
    </span>
  );
}
