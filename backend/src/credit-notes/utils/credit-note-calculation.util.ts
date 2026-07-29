import Decimal from 'decimal.js';

export interface CreditNoteCalculationLine {
  quantity: number;
  unitPriceHt: number;
  tvaRate: number;
}

export interface CreditNoteTotals {
  totalHt: number;
  totalTva: number;
  totalTtc: number;
}

export function roundCreditNoteMoney(value: Decimal.Value): number {
  return new Decimal(value)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function calculateCreditNoteTotals(
  lines: CreditNoteCalculationLine[],
): CreditNoteTotals {
  const totalHtDecimal = lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.unitPriceHt).mul(line.quantity)),
    new Decimal(0),
  );
  const totalTvaDecimal = lines.reduce(
    (sum, line) =>
      sum.plus(
        new Decimal(line.unitPriceHt)
          .mul(line.quantity)
          .mul(line.tvaRate)
          .div(100),
      ),
    new Decimal(0),
  );
  const totalHt = roundCreditNoteMoney(totalHtDecimal);
  const totalTva = roundCreditNoteMoney(totalTvaDecimal);

  return {
    totalHt,
    totalTva,
    totalTtc: roundCreditNoteMoney(new Decimal(totalHt).plus(totalTva)),
  };
}

export function calculateCreditNoteLineTotals(
  line: CreditNoteCalculationLine,
): CreditNoteTotals {
  return calculateCreditNoteTotals([line]);
}
