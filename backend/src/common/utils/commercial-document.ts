export const DEFAULT_STAMP_DUTY = 1;

export function commercialTotalFinal(
  totalTtc: number | string | { toString(): string },
  stampDuty: number | string | { toString(): string } | null | undefined,
): number {
  const parsedStamp = Number(stampDuty);
  return Math.round(
    (Number(totalTtc) + (Number.isFinite(parsedStamp) ? parsedStamp : 0)) * 1000,
  ) / 1000;
}
