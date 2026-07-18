import type { ReactNode } from 'react';

type SaleWithConsolidation = {
  activeConsolidation?: { id: string; invoiceNumber: string } | null;
};

export function isSourceOfActiveConsolidation(sale: SaleWithConsolidation) {
  return Boolean(sale.activeConsolidation);
}

export function SalePaymentCell({
  sale,
  children,
}: {
  sale: SaleWithConsolidation;
  children: ReactNode;
}) {
  if (isSourceOfActiveConsolidation(sale)) {
    return <span className="font-normal text-muted-foreground">—</span>;
  }

  return <>{children}</>;
}
