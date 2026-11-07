import { describe, expect, it } from 'vitest';
import { parseSlotQuery } from './slot';

// Шов 3 (unit): валидация параметров вычисляемых слотов (ADR-0011).
// Проверяются hand-written дополнения к контракту (ADR-005): окно по
// умолчанию (14 дней — D6), нормализация ISO со смещением в UTC-инстант
// (ADR-009) и порядок `from <= to`. Тесты публикации интервалов удалены
// вместе с POST /api/v1/slots.

const NOW = new Date('2026-11-07T12:00:00Z');

describe('parseSlotQuery', () => {
  it('пустые параметры → дефолтное окно [now; now + 14 дней]', () => {
    const result = parseSlotQuery({}, NOW);

    expect(result).toEqual({
      ok: true,
      value: { from: NOW, to: new Date('2026-11-21T12:00:00.000Z') },
    });
  });

  it('валидные from/to со смещением принимаются и нормализуются', () => {
    const result = parseSlotQuery(
      {
        from: '2026-11-08T00:00:00+03:00',
        to: '2026-11-09T00:00:00Z',
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        from: new Date('2026-11-07T21:00:00.000Z'),
        to: new Date('2026-11-09T00:00:00.000Z'),
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

  it('время без зоны (локальное) отклоняется', () => {
    const result = parseSlotQuery({ to: '2026-11-09T00:00:00' }, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { field: 'to', message: expect.stringContaining('ISO 8601') },
      ]);
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
