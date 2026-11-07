import { describe, expect, it } from 'vitest';
import { intervalsOverlap } from './intervals';

// Шов 3 (unit, NFR-003): чистая функция пересечения полуинтервалов
// [startsAt; endsAt) — единственное место бизнес-правила «интервалы не
// пересекаются» (ADR-008). Граничные случаи зафиксированы literals.

const interval = (startIso: string, endIso: string) => ({
  startsAt: new Date(startIso),
  endsAt: new Date(endIso),
});

describe('intervalsOverlap', () => {
  it('частичное пересечение — true', () => {
    const a = interval('2026-11-08T10:00:00Z', '2026-11-08T10:30:00Z');
    const b = interval('2026-11-08T10:15:00Z', '2026-11-08T10:45:00Z');

    expect(intervalsOverlap(a, b)).toBe(true);
    expect(intervalsOverlap(b, a)).toBe(true);
  });

  it('один целиком внутри другого — true', () => {
    const outer = interval('2026-11-08T10:00:00Z', '2026-11-08T12:00:00Z');
    const inner = interval('2026-11-08T10:30:00Z', '2026-11-08T11:00:00Z');

    expect(intervalsOverlap(outer, inner)).toBe(true);
    expect(intervalsOverlap(inner, outer)).toBe(true);
  });

  it('совпадающие интервалы — true', () => {
    const a = interval('2026-11-08T10:00:00Z', '2026-11-08T10:30:00Z');

    expect(intervalsOverlap(a, { ...a })).toBe(true);
  });

  it('вплотную соседние (конец == начало) — false, не пересечение', () => {
    const first = interval('2026-11-08T10:00:00Z', '2026-11-08T10:30:00Z');
    const second = interval('2026-11-08T10:30:00Z', '2026-11-08T11:00:00Z');

    expect(intervalsOverlap(first, second)).toBe(false);
    expect(intervalsOverlap(second, first)).toBe(false);
  });

  it('непересекающиеся — false', () => {
    const a = interval('2026-11-08T10:00:00Z', '2026-11-08T10:30:00Z');
    const b = interval('2026-11-08T11:00:00Z', '2026-11-08T11:30:00Z');

    expect(intervalsOverlap(a, b)).toBe(false);
    expect(intervalsOverlap(b, a)).toBe(false);
  });
});
