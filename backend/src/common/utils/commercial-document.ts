import { Prisma } from '@prisma/client';

export const DEFAULT_STAMP_DUTY = 1;

export function commercialTotalFinalDecimal(
  totalTtc: Prisma.Decimal.Value,
  stampDuty: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal {
  return new Prisma.Decimal(totalTtc ?? 0)
    .plus(stampDuty ?? 0)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function commercialTotalFinal(
  totalTtc: number | string | { toString(): string },
  stampDuty: number | string | { toString(): string } | null | undefined,
): number {
  return commercialTotalFinalDecimal(
    typeof totalTtc === 'object' ? totalTtc.toString() : totalTtc,
    stampDuty == null
      ? 0
      : typeof stampDuty === 'object'
        ? stampDuty.toString()
        : stampDuty,
  ).toNumber();
}
