import type { FinancialPeriod } from './dto/financial-analytics.dto';

const TUNIS_OFFSET = '+01:00';
const tunisDate = (year: number, month: number, day: number, end = false) =>
  new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${end ? '23:59:59.999' : '00:00:00.000'}${TUNIS_OFFSET}`);

export function resolveFinancialPeriod(period: FinancialPeriod = 'month', dateFrom?: string, dateTo?: string, now = new Date()) {
  const local = new Date(now.getTime() + 60 * 60 * 1000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth() + 1, d = local.getUTCDate();
  let start: Date; let end: Date;
  if (period === 'custom' && dateFrom && dateTo) {
    start = new Date(`${dateFrom.slice(0, 10)}T00:00:00.000${TUNIS_OFFSET}`);
    end = new Date(`${dateTo.slice(0, 10)}T23:59:59.999${TUNIS_OFFSET}`);
  } else if (period === 'today' || period === 'yesterday') {
    const shift = period === 'yesterday' ? -1 : 0;
    const target = new Date(Date.UTC(y, m - 1, d + shift));
    start = tunisDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
    end = tunisDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), true);
  } else if (period === 'week') {
    const weekday = local.getUTCDay() || 7;
    const monday = new Date(Date.UTC(y, m - 1, d - weekday + 1));
    start = tunisDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()); end = now;
  } else if (period === 'year') { start = tunisDate(y, 1, 1); end = now;
  } else { start = tunisDate(y, m, 1); end = now; }
  const duration = end.getTime() - start.getTime() + 1;
  return { current: { gte: start, lte: end }, previous: { gte: new Date(start.getTime() - duration), lte: new Date(start.getTime() - 1) } };
}
