import { describe, expect, it } from 'vitest';
import { bookingWindow, generateSlots, isSlotStartOnGrid, type WorkingDayHours } from './slots';

// Чистый генератор вычисляемых слотов (ADR-0011): unit-тесты шва 3.
// Генератор не зависит от «сейчас» — окно [from; to] задаёт вызывающий,
// поэтому абсолютные даты здесь безопасны (в отличие от «начала в будущем»).

const MSK = 'Europe/Moscow';

/** Пн–Пт 09:00–18:00, Сб–Вс выходные (дефолт D3); 0 — воскресенье. */
function nineToEighteenWeek(): WorkingDayHours[] {
  return Array.from({ length: 7 }, (_, weekday) =>
    weekday === 0 || weekday === 6
      ? { weekday, isDayOff: true, startMinutes: 0, endMinutes: 0 }
      : { weekday, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  );
}

/** Все дни недели рабочие с одинаковыми границами. */
function everyDay(startMinutes: number, endMinutes: number): WorkingDayHours[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isDayOff: false,
    startMinutes,
    endMinutes,
  }));
}

const MONDAY_NOV9 = '2026-11-09'; // понедельник
const msk = (wall: string) => new Date(`${wall}:00+03:00`);

describe('generateSlots', () => {
  it('окно 14 дней: слоты в каждом рабочем дне, выходные пропущены', () => {
    // 2026-11-09 — понедельник; 9..22 ноября = 10 рабочих дней (Сб 14/21, Вс 15/22)
    const slots = generateSlots({
      from: msk(`2026-11-09T00:00`),
      to: msk(`2026-11-22T23:59`),
      durationMinutes: 60,
      workingHours: nineToEighteenWeek(),
      timeZone: MSK,
    });

    expect(slots).toHaveLength(10 * 9);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-11-09T06:00:00.000Z'); // 09:00 MSK
    expect(slots.at(-1)?.startsAt.toISOString()).toBe('2026-11-20T14:00:00.000Z'); // пт 17:00 MSK
    expect(slots.at(-1)?.endsAt.toISOString()).toBe('2026-11-20T15:00:00.000Z'); // 18:00 MSK

    // ни одного слота в субботу/воскресенье стены (MSK)
    const weekendDays = new Set(
      slots.map((slot) => {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: MSK }).format(slot.startsAt);
        return day;
      }),
    );
    expect(weekendDays).not.toContain('2026-11-14');
    expect(weekendDays).not.toContain('2026-11-15');
    expect(weekendDays).not.toContain('2026-11-21');
    expect(weekendDays).not.toContain('2026-11-22');
  });

  it('шаг стартов равен длительности типа (D2): 30 минут — старты вплотную', () => {
    const slots = generateSlots({
      from: msk(`${MONDAY_NOV9}T00:00`),
      to: msk(`2026-11-10T00:00`),
      durationMinutes: 30,
      workingHours: nineToEighteenWeek(),
      timeZone: MSK,
    });

    expect(slots).toHaveLength(18); // 09:00 … 17:30
    for (let i = 1; i < slots.length; i += 1) {
      const gap = slots[i]!.startsAt.getTime() - slots[i - 1]!.startsAt.getTime();
      expect(gap).toBe(30 * 60 * 1000); // примыкание: [10:00,10:30) и [10:30,11:00) соседствуют
    }
    const first = slots[0]!;
    expect(first.endsAt.getTime() - first.startsAt.getTime()).toBe(30 * 60 * 1000);
  });

  it('последний старт не выходит за конец рабочих часов: слот целиком в дне', () => {
    const slots = generateSlots({
      from: msk(`${MONDAY_NOV9}T00:00`),
      to: msk(`2026-11-10T00:00`),
      durationMinutes: 60,
      workingHours: everyDay(9 * 60, 11 * 60 + 30), // 09:00–11:30 = 150 минут
      timeZone: MSK,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-11-09T06:00:00.000Z', // 09:00–10:00
      '2026-11-09T07:00:00.000Z', // 10:00–11:00 (старт 11:00 не влез: конец был бы 12:00)
    ]);
  });

  it('все дни выходные — слотов нет; день без записи в рабочих часах пропускается', () => {
    const allOff = nineToEighteenWeek().map((day) => ({ ...day, isDayOff: true }));
    expect(
      generateSlots({
        from: msk(`${MONDAY_NOV9}T00:00`),
        to: msk(`2026-11-16T00:00`),
        durationMinutes: 30,
        workingHours: allOff,
        timeZone: MSK,
      }),
    ).toEqual([]);

    const withoutMonday = nineToEighteenWeek().filter((day) => day.weekday !== 1);
    expect(
      generateSlots({
        from: msk(`${MONDAY_NOV9}T00:00`),
        to: msk(`2026-11-10T00:00`),
        durationMinutes: 30,
        workingHours: withoutMonday,
        timeZone: MSK,
      }),
    ).toEqual([]);
  });

  it('период [from; to] оставляет старты внутри, обе границы включены', () => {
    const slots = generateSlots({
      from: msk(`${MONDAY_NOV9}T10:00`),
      to: msk(`${MONDAY_NOV9}T15:00`),
      durationMinutes: 60,
      workingHours: nineToEighteenWeek(),
      timeZone: MSK,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-11-09T07:00:00.000Z', // 10:00 MSK — ровно from, включён
      '2026-11-09T08:00:00.000Z',
      '2026-11-09T09:00:00.000Z',
      '2026-11-09T10:00:00.000Z',
      '2026-11-09T11:00:00.000Z',
      '2026-11-09T12:00:00.000Z', // 15:00 MSK — ровно to, включён
    ]);
  });

  it('конец суток 24:00 (1440 минут) допустим как граница часов', () => {
    const slots = generateSlots({
      from: msk(`${MONDAY_NOV9}T00:00`),
      to: msk(`2026-11-10T00:00`), // вторник 00:00 — граница включена
      durationMinutes: 12 * 60,
      workingHours: everyDay(0, 1440),
      timeZone: MSK,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-11-08T21:00:00.000Z', // полночь стены MSK
      '2026-11-09T09:00:00.000Z', // полдень стены MSK
      '2026-11-09T21:00:00.000Z', // полночь вторника — ровно to, включён
    ]);
  });

  it('to раньше from — пустой список (защита, route валидирует раньше)', () => {
    expect(
      generateSlots({
        from: msk(`2026-11-10T00:00`),
        to: msk(`${MONDAY_NOV9}T00:00`),
        durationMinutes: 30,
        workingHours: nineToEighteenWeek(),
        timeZone: MSK,
      }),
    ).toEqual([]);
  });
});

describe('bookingWindow — окно записи (D6)', () => {
  it('14 настенных дней начиная с сегодня: от полуночи сегодня до 23:59:59.999 дня +13', () => {
    const now = msk(`2026-11-09T19:30`); // понедельник вечером — день уже начался

    const window = bookingWindow(now, MSK);

    expect(window.from.getTime()).toBe(msk(`${MONDAY_NOV9}T00:00`).getTime());
    expect(window.to.getTime()).toBe(new Date('2026-11-22T23:59:59.999+03:00').getTime());
  });

  it('после конца рабочих часов первые слоты окна — завтра (GET от now, инъекция now)', () => {
    const now = msk(`2026-11-09T19:00`); // понедельник после 18:00
    const window = bookingWindow(now, MSK);

    // дефолт GET слотов: период [now; окно] — понедельник уже не даёт слотов
    const slots = generateSlots({
      from: now,
      to: window.to,
      durationMinutes: 30,
      workingHours: nineToEighteenWeek(),
      timeZone: MSK,
    });

    expect(slots[0]?.startsAt.toISOString()).toBe('2026-11-10T06:00:00.000Z'); // вторник 09:00
    expect(slots.every((slot) => slot.startsAt.getTime() > now.getTime())).toBe(true);
  });
});

describe('isSlotStartOnGrid — серверный инвариант слота (ADR-004, D6)', () => {
  // понедельник 19:00: сетка понедельника уже отработала, окно — пн 09..вс 22 ноября
  const NOW = msk(`2026-11-09T19:00`);

  it('старт на сетке в рабочие часы — допустим, включая границу конца часов', () => {
    expect(isSlotStartOnGrid(msk('2026-11-10T10:00'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      true,
    );
    // [17:30; 18:00) — последний старт, заканчивается ровно в конец часов
    expect(isSlotStartOnGrid(msk('2026-11-10T17:30'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      true,
    );
  });

  it('вне сетки (10:17 при шаге 30 от 09:00) — не слот', () => {
    expect(isSlotStartOnGrid(msk('2026-11-10T10:17'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      false,
    );
  });

  it('ночь и выходной — не слот', () => {
    expect(isSlotStartOnGrid(msk('2026-11-10T03:00'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      false,
    );
    expect(isSlotStartOnGrid(msk('2026-11-14T10:00'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      false,
    ); // суббота
  });

  it('за окном записи (15-й настенный день и дальше) — не слот', () => {
    // 2026-11-23 — понедельник на сетке, но окно кончается 22 ноября
    expect(isSlotStartOnGrid(msk('2026-11-23T10:00'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      false,
    );
  });

  it('утренний слот сегодняшнего дня в окне, даже когда уже прошёл (прошлость — отдельное правило 409)', () => {
    expect(isSlotStartOnGrid(msk('2026-11-09T09:00'), 30, nineToEighteenWeek(), NOW, MSK)).toBe(
      true,
    );
  });
});
