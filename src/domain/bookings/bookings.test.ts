import { describe, expect, it } from 'vitest';
import { isUpcoming } from './bookings';

// Спецификация upcoming-фильтра (ADR-0011, GET /api/v1/bookings?upcoming):
// предстоящая бронь — встреча ещё не закончилась: конец ≥ сейчас.
// Шов 3; хранилищный двойник (endsAt >= now в SQL) пиннится API-тестом.

const NOW = new Date('2026-11-07T12:00:00Z');

describe('isUpcoming', () => {
  it('встреча впереди → предстоящая', () => {
    expect(isUpcoming({ endsAt: new Date('2026-11-07T12:00:01Z') }, NOW)).toBe(true);
    expect(isUpcoming({ endsAt: new Date('2026-11-09T10:00:00Z') }, NOW)).toBe(true);
  });

  it('конец ровно сейчас — ещё не закончилась (граница включена)', () => {
    expect(isUpcoming({ endsAt: new Date('2026-11-07T12:00:00Z') }, NOW)).toBe(true);
  });

  it('встреча закончилась раньше — не предстоящая', () => {
    expect(isUpcoming({ endsAt: new Date('2026-11-07T11:59:59Z') }, NOW)).toBe(false);
    expect(isUpcoming({ endsAt: new Date('2026-11-06T18:00:00Z') }, NOW)).toBe(false);
  });
});
