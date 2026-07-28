import { resolveCashDateRange } from './caisse.service';

describe('resolveCashDateRange — Africa/Tunis', () => {
  const now = new Date('2026-07-28T15:00:00.000Z');

  it('délimite aujourd’hui selon minuit local UTC+1', () => {
    expect(resolveCashDateRange('today', undefined, undefined, now)).toEqual({
      gte: new Date('2026-07-27T23:00:00.000Z'),
      lte: new Date('2026-07-28T22:59:59.999Z'),
    });
  });

  it('sépare strictement hier d’aujourd’hui', () => {
    expect(resolveCashDateRange('yesterday', undefined, undefined, now)).toEqual({
      gte: new Date('2026-07-26T23:00:00.000Z'),
      lte: new Date('2026-07-27T22:59:59.999Z'),
    });
  });

  it('commence la semaine le lundi et inclut le dimanche', () => {
    expect(resolveCashDateRange('week', undefined, undefined, now)).toEqual({
      gte: new Date('2026-07-26T23:00:00.000Z'),
      lte: new Date('2026-08-02T22:59:59.999Z'),
    });
  });

  it('couvre le mois civil courant, pas les 30 derniers jours', () => {
    expect(resolveCashDateRange('month', undefined, undefined, now)).toEqual({
      gte: new Date('2026-06-30T23:00:00.000Z'),
      lte: new Date('2026-07-31T22:59:59.999Z'),
    });
  });

  it('inclut intégralement les deux dates personnalisées', () => {
    expect(resolveCashDateRange('custom', '2026-07-01', '2026-07-28', now)).toEqual({
      gte: new Date('2026-06-30T23:00:00.000Z'),
      lte: new Date('2026-07-28T22:59:59.999Z'),
    });
  });

  it('refuse une plage personnalisée inversée', () => {
    expect(() => resolveCashDateRange(
      'custom',
      '2026-07-28',
      '2026-07-01',
      now,
    )).toThrow(/date de début/);
  });
});
