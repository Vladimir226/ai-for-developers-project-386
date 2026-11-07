import { describe, expect, it } from 'vitest';
import { parseCreateSlotBody, parseSlotQuery } from './slot';

// Шов 3 (unit): валидация запросов слотов. Структура — сгенерированная из
// контракта схема (ADR-010); здесь проверяются hand-written дополнения
// (ADR-005): доменные правила и нормализация времени в UTC (ADR-009).

const NOW = new Date('2026-11-07T12:00:00Z');

describe('parseCreateSlotBody', () => {
  it('принимает ISO со смещением и нормализует в UTC-инстант', () => {
    const result = parseCreateSlotBody(
      { startsAt: '2026-11-08T13:00:00+03:00', endsAt: '2026-11-08T14:00:00+03:00' },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        startsAt: new Date('2026-11-08T10:00:00.000Z'),
        endsAt: new Date('2026-11-08T11:00:00.000Z'),
      },
    });
  });

  it('время без зоны (локальное) отклоняется', () => {
    const result = parseCreateSlotBody(
      { startsAt: '2026-11-08T13:00:00', endsAt: '2026-11-08T14:00:00Z' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { field: 'startsAt', message: expect.stringContaining('ISO 8601') },
      ]);
    }
  });

  it('отсутствующее поле → issue с именем поля', () => {
    const result = parseCreateSlotBody({ startsAt: '2026-11-08T10:00:00Z' }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({ field: 'endsAt', message: expect.any(String) });
    }
  });

  it('начало в прошлом отклоняется', () => {
    const result = parseCreateSlotBody(
      { startsAt: '2026-11-07T11:59:59Z', endsAt: '2026-11-08T10:00:00Z' },
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      issues: [{ field: 'startsAt', message: expect.stringContaining('будущем') }],
    });
  });

  it('начало ровно сейчас тоже прошлое (строгое «в будущем»)', () => {
    const result = parseCreateSlotBody(
      { startsAt: '2026-11-07T12:00:00Z', endsAt: '2026-11-08T10:00:00Z' },
      NOW,
    );

    expect(result.ok).toBe(false);
  });

  it('конец равен началу или раньше него отклоняется', () => {
    const equal = parseCreateSlotBody(
      { startsAt: '2026-11-08T10:00:00Z', endsAt: '2026-11-08T10:00:00Z' },
      NOW,
    );
    const earlier = parseCreateSlotBody(
      { startsAt: '2026-11-08T10:00:00Z', endsAt: '2026-11-08T09:00:00Z' },
      NOW,
    );

    expect(equal).toEqual({
      ok: false,
      issues: [{ field: 'endsAt', message: expect.stringContaining('позже начала') }],
    });
    expect(earlier.ok).toBe(false);
  });
});

describe('parseSlotQuery', () => {
  it('пустые параметры → дефолтное окно [now; now + 14 дней], view=free', () => {
    const result = parseSlotQuery({}, NOW);

    expect(result).toEqual({
      ok: true,
      value: { from: NOW, to: new Date('2026-11-21T12:00:00.000Z'), view: 'free' },
    });
  });

  it('валидные from/to/view со смещением принимаются и нормализуются', () => {
    const result = parseSlotQuery(
      { from: '2026-11-08T00:00:00+03:00', to: '2026-11-09T00:00:00Z', view: 'all' },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        from: new Date('2026-11-07T21:00:00.000Z'),
        to: new Date('2026-11-09T00:00:00.000Z'),
        view: 'all',
      },
    });
  });

  it('невалидный from → issue', () => {
    const result = parseSlotQuery({ from: 'завтра' }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ field: 'from', message: expect.any(String) }]);
    }
  });

  it('невалидный view → issue', () => {
    const result = parseSlotQuery({ view: 'everything' }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ field: 'view', message: expect.any(String) }]);
    }
  });

  it('from позже to → issue', () => {
    const result = parseSlotQuery(
      { from: '2026-11-09T00:00:00Z', to: '2026-11-08T00:00:00Z' },
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ field: 'from', message: expect.any(String) }]);
    }
  });
});
