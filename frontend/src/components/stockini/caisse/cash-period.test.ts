import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCashPeriodParams, cashPeriodQueryKey, cashProfitTitle, shouldShowCashKpiLoader } from './cash-period';

test('la période personnalisée envoie les deux dates et Africa/Tunis', () => {
  assert.deepEqual(buildCashPeriodParams({
    period: 'custom',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
  }), {
    period: 'custom',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    timezone: 'Africa/Tunis',
  });
});

test('le titre du bénéfice suit le libellé de période', () => {
  assert.equal(cashProfitTitle("Aujourd'hui"), "Bénéfice net — Aujourd'hui");
  assert.equal(cashProfitTitle('Hier'), 'Bénéfice net — Hier');
  assert.equal(cashProfitTitle('Cette semaine'), 'Bénéfice net — Cette semaine');
  assert.equal(cashProfitTitle('Du 01/07/2026 au 28/07/2026'), 'Bénéfice net — Du 01/07/2026 au 28/07/2026');
});

test('le loader remplace la valeur pendant chaque rechargement', () => {
  assert.equal(shouldShowCashKpiLoader(false, true), true);
  assert.equal(shouldShowCashKpiLoader(false, false), false);
});

test('la query key change avec chaque filtre et chaque plage', () => {
  const today = cashPeriodQueryKey('caisse-summary', {
    period: 'today', startDate: '', endDate: '',
  });
  const yesterday = cashPeriodQueryKey('caisse-summary', {
    period: 'yesterday', startDate: '', endDate: '',
  });
  const custom = cashPeriodQueryKey('caisse-summary', {
    period: 'custom', startDate: '2026-07-01', endDate: '2026-07-28',
  });
  assert.notDeepEqual(today, yesterday);
  assert.notDeepEqual(today, custom);
});
