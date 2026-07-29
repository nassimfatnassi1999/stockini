import { resolveCashDateRange } from './caisse.service';

describe('resolveCashDateRange — Africa/Tunis', () => {
  const now = new Date('2026-07-28T15:00:00.000Z');

  it('délimite aujourd’hui selon minuit local UTC+1', () => {
    expect(resolveCashDateRange('today', undefined, undefined, now)).toEqual({
      gte: new Date('2026-07-27T23:00:00.000Z'),
      lte: now,
    });
  });

  it('sépare strictement hier d’aujourd’hui', () => {
    expect(
      resolveCashDateRange('yesterday', undefined, undefined, now),
    ).toEqual({
      gte: new Date('2026-07-26T23:00:00.000Z'),
      lte: new Date('2026-07-27T22:59:59.999Z'),
    });
  });

  it('commence la semaine le lundi et s’arrête maintenant', () => {
    expect(resolveCashDateRange('week', undefined, undefined, now)).toEqual({
      gte: new Date('2026-07-26T23:00:00.000Z'),
      lte: now,
    });
  });

  it('couvre le mois civil courant jusqu’à maintenant', () => {
    expect(resolveCashDateRange('month', undefined, undefined, now)).toEqual({
      gte: new Date('2026-06-30T23:00:00.000Z'),
      lte: now,
    });
  });

  it('inclut intégralement les deux dates personnalisées', () => {
    expect(
      resolveCashDateRange('custom', '2026-07-01', '2026-07-28', now),
    ).toEqual({
      gte: new Date('2026-06-30T23:00:00.000Z'),
      lte: new Date('2026-07-28T22:59:59.999Z'),
    });
  });

  it('refuse une plage personnalisée inversée', () => {
    expect(() =>
      resolveCashDateRange('custom', '2026-07-28', '2026-07-01', now),
    ).toThrow(/date de début/);
  });
});
