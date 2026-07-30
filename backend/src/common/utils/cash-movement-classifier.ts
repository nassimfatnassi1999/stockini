import {
  CaisseMovementType,
  CashDirection,
  Prisma,
} from '@prisma/client';

export const CASH_IN_MOVEMENT_TYPES: CaisseMovementType[] = [
  CaisseMovementType.ENCAISSEMENT_VENTE,
  CaisseMovementType.CASH_SURPLUS_IN,
  CaisseMovementType.DEPOT_MANUEL,
  CaisseMovementType.ANNULATION_ACHAT,
  CaisseMovementType.ANNULATION_DEPENSE,
];

export const CASH_OUT_MOVEMENT_TYPES: CaisseMovementType[] = [
  CaisseMovementType.CUSTOMER_CHANGE_OUT,
  CaisseMovementType.DECAISSEMENT_ACHAT,
  CaisseMovementType.DEPENSE_GENERALE,
  CaisseMovementType.RETRAIT_MANUEL,
  CaisseMovementType.ANNULATION_VENTE,
  CaisseMovementType.REFUND_OUT,
];

export type ClassifiableCashMovement = {
  type: CaisseMovementType;
  montant: Prisma.Decimal.Value;
};

/**
 * Unique source of truth for cash-flow direction.
 *
 * Persisted movement amounts are absolute values. Their sign must therefore
 * never be used to infer whether the business event is an inflow or outflow.
 * CASH_RESET is a balance reconciliation and is intentionally excluded from
 * cash-flow totals.
 */
export class CashMovementClassifier {
  static direction(type: CaisseMovementType): CashDirection | null {
    if (CASH_IN_MOVEMENT_TYPES.includes(type)) return CashDirection.IN;
    if (CASH_OUT_MOVEMENT_TYPES.includes(type)) return CashDirection.OUT;
    return null;
  }

  static summarize(movements: ClassifiableCashMovement[]) {
    const zero = () => new Prisma.Decimal(0);
    let inflows = zero();
    let outflows = zero();
    const totalsByType = new Map<CaisseMovementType, Prisma.Decimal>();

    for (const movement of movements) {
      const amount = new Prisma.Decimal(movement.montant ?? 0).abs();
      const direction = this.direction(movement.type);
      if (direction === CashDirection.IN) inflows = inflows.plus(amount);
      if (direction === CashDirection.OUT) outflows = outflows.plus(amount);
      totalsByType.set(
        movement.type,
        (totalsByType.get(movement.type) ?? zero()).plus(amount),
      );
    }

    const byType = (type: CaisseMovementType) =>
      totalsByType.get(type) ?? zero();

    return {
      inflows,
      outflows,
      netFlow: inflows.minus(outflows),
      paidExpenses: byType(CaisseMovementType.DEPENSE_GENERALE),
      creditNoteRefunds: byType(CaisseMovementType.REFUND_OUT),
      returnedChange: byType(CaisseMovementType.CUSTOMER_CHANGE_OUT),
      retainedSurplus: byType(CaisseMovementType.CASH_SURPLUS_IN),
    };
  }
}

