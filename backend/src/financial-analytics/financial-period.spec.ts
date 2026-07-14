import { resolveFinancialPeriod } from './financial-period';

describe('resolveFinancialPeriod (Africa/Tunis)', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  it('uses Tunis midnight for today', () => {
    const { current } = resolveFinancialPeriod('today', undefined, undefined, now);
    expect(current.gte.toISOString()).toBe('2026-07-13T23:00:00.000Z');
    expect(current.lte.toISOString()).toBe('2026-07-14T22:59:59.999Z');
  });
  it('creates a previous range with exactly the same duration', () => {
    const { current, previous } = resolveFinancialPeriod('custom', '2026-07-01', '2026-07-10', now);
    expect(current.lte.getTime() - current.gte.getTime()).toBe(previous.lte.getTime() - previous.gte.getTime());
  });
});
