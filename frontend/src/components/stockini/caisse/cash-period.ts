export type CashPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export interface CashPeriodSelection {
  period: CashPeriod;
  startDate: string;
  endDate: string;
}

export const CASH_TIMEZONE = 'Africa/Tunis';

export function cashProfitTitle(periodLabel: string): string {
  return `Bénéfice net — ${periodLabel}`;
}

export function shouldShowCashKpiLoader(
  isLoading: boolean,
  isFetching: boolean,
): boolean {
  return isLoading || isFetching;
}

export function buildCashPeriodParams(
  filters: CashPeriodSelection,
  account?: string,
): Record<string, string> {
  const params: Record<string, string> = {
    period: filters.period,
    timezone: CASH_TIMEZONE,
  };
  if (filters.period === 'custom' && filters.startDate && filters.endDate) {
    params.startDate = filters.startDate;
    params.endDate = filters.endDate;
  }
  if (account) params.account = account;
  return params;
}

export function cashPeriodQueryKey(
  scope: string,
  filters: CashPeriodSelection,
  account?: string,
): readonly string[] {
  return [
    scope,
    filters.period,
    filters.startDate,
    filters.endDate,
    account ?? '',
    CASH_TIMEZONE,
  ];
}
