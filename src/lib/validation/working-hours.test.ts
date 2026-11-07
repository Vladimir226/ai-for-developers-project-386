import { describe, expect, it } from 'vitest';
import { parseWorkingHoursBody } from './working-hours';

// Валидация рабочих часов (ADR-005, D3): структура и границы минут —
// сгенерированная схема контракта; «ровно 7 дней без дублей» и
// «startMinutes < endMinutes у рабочего дня» в контракте невыразимы —
// серверная надстройка (unit-тесты шва 3, интеграция — route.test.ts).

const MONDAY_TO_FRIDAY = { isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 };

function week(): unknown[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, ...MONDAY_TO_FRIDAY }));
}

describe('parseWorkingHoursBody', () => {
  it('валидная неделя → 7 нормализованных дней, выходным обнуляются минуты', () => {
    const days = week();
    days[6] = { weekday: 6, isDayOff: true }; // суббота — выходной, минуты не заданы
    days[0] = { weekday: 0, isDayOff: true, startMinutes: 600, endMinutes: 700 }; // лишние минуты игнорируются

    const parsed = parseWorkingHoursBody({ days });

    expect(parsed).toEqual({
      ok: true,
      value: expect.arrayContaining([
        { weekday: 0, isDayOff: true, startMinutes: 0, endMinutes: 0 },
        { weekday: 1, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 6, isDayOff: true, startMinutes: 0, endMinutes: 0 },
      ]),
    });
    expect(parsed.ok && parsed.value).toHaveLength(7);
  });

  it('шесть дней → 422-issues по полю days', () => {
    const parsed = parseWorkingHoursBody({ days: week().slice(0, 6) });

    expect(parsed).toEqual({
      ok: false,
      issues: [expect.objectContaining({ field: 'days' })],
    });
  });

  it('восемь дней → 422-issues по полю days (и длина, и дубль)', () => {
    const days = week();
    days.push({ weekday: 3, ...MONDAY_TO_FRIDAY });

    const parsed = parseWorkingHoursBody({ days });

    expect(parsed).toMatchObject({ ok: false });
    expect(parsed.ok === false && parsed.issues).toEqual([
      expect.objectContaining({ field: 'days', message: expect.stringContaining('ровно 7') }),
      expect.objectContaining({ field: 'days', message: expect.stringContaining('повторяться') }),
    ]);
  });

  it('дубль дня недели → 422-issues по полю days', () => {
    const days = week();
    days[4] = { weekday: 3, ...MONDAY_TO_FRIDAY }; // два четверга, нет пятницы

    expect(parseWorkingHoursBody({ days })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ field: 'days' })],
    });
  });

  it('рабочий день с startMinutes ≥ endMinutes → 422-issues по endMinutes дня', () => {
    const days = week();
    days[2] = { weekday: 2, isDayOff: false, startMinutes: 600, endMinutes: 600 };

    const parsed = parseWorkingHoursBody({ days });

    expect(parsed).toEqual({
      ok: false,
      issues: [expect.objectContaining({ field: 'days.2.endMinutes' })],
    });
  });

  it('рабочему дню не заданы минуты → 422-issues по минутам дня', () => {
    const days = week();
    days[5] = { weekday: 5, isDayOff: false };

    const parsed = parseWorkingHoursBody({ days });

    expect(parsed).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ field: 'days.5.startMinutes' }),
        expect.objectContaining({ field: 'days.5.endMinutes' }),
      ]),
    });
  });

  it('границы контракта: день недели и минуты проверяет сгенерированная схема', () => {
    const badWeekday = week();
    badWeekday[3] = { weekday: 7, ...MONDAY_TO_FRIDAY };

    const badMinutes = week();
    badMinutes[1] = { weekday: 1, isDayOff: false, startMinutes: -1, endMinutes: 18 * 60 };

    for (const body of [{ days: badWeekday }, { days: badMinutes }, { days: 'не неделя' }]) {
      const parsed = parseWorkingHoursBody(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
    }
  });
});
