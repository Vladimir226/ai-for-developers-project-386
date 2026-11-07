import { describe, expect, it } from 'vitest';
import { parseSlotQuery } from '@/lib/validation/slot';
import {
  apiFailureFromError,
  bookingBanner,
  buildBookingCalendar,
  countWindows,
  firstOpenDateKey,
  humanDuration,
} from './booking-logic';

// Шов 3 (unit): чистая логика публичной страницы (ADR-0004: тонкий UI) —
// окно записи 14 настенных дат включая сегодня по APP_TZ (D6, ADR-0009),
// группировка вычисляемых слотов (без идентификаторов, ADR-0011) по настенным
// дням, хвост 15-й даты сверх окна не показывается (период GET — надмножество
// окна), человекочитаемая длительность типов, разбор конверта ошибок
// (ADR-0005 — только по error.code) и тексты баннеров. Ожидания — literals.

const MSK = 'Europe/Moscow';
const NOW = new Date('2026-11-07T12:00:00.000Z'); // суббота, 15:00 MSK

function slot(startsAt: string, endsAt: string) {
  return { startsAt, endsAt };
}

const SLOTS = [
  slot('2026-11-10T07:00:00.000Z', '2026-11-10T07:30:00.000Z'), // вт 10.11, 10:00–10:30 MSK
  slot('2026-11-10T07:30:00.000Z', '2026-11-10T08:00:00.000Z'), // вт 10.11, 10:30–11:00 MSK
  slot('2026-11-11T12:00:00.000Z', '2026-11-11T12:30:00.000Z'), // ср 11.11, 15:00–15:30 MSK
  slot('2026-11-20T09:00:00.000Z', '2026-11-20T09:30:00.000Z'), // пт 20.11, 12:00–12:30 MSK — последний день окна
  slot('2026-11-21T07:00:00.000Z', '2026-11-21T07:30:00.000Z'), // сб 21.11, 10:00–10:30 MSK — хвост 15-й даты периода GET
  slot('2026-12-05T09:00:00.000Z', '2026-12-05T09:30:00.000Z'), // сб 5.12 — далеко за окном
];

describe('buildBookingCalendar', () => {
  const cal = buildBookingCalendar(SLOTS, MSK, NOW);

  it('окно — 14 настенных дат включая сегодня (D6: 7→20 ноября)', () => {
    expect(cal.todayKey).toBe('2026-11-07');
    expect(cal.windowEndKey).toBe('2026-11-20');
  });

  it('окно в одном месяце: только ноябрь, подпись — именительный падеж без «г.»', () => {
    expect(cal.months.map((m) => ({ key: m.key, label: m.label }))).toEqual([
      { key: '2026-11', label: 'ноябрь 2026' },
    ]);
  });

  it('дни группируются по настенной дате APP_TZ, времена — диапазоны', () => {
    const day = cal.days['2026-11-10'];
    expect(day.title).toBe('вторник, 10 ноября');
    expect(day.slots.map((s) => s.timeLabel)).toEqual(['10:00–10:30', '10:30–11:00']);
    expect(cal.days['2026-11-11'].title).toBe('среда, 11 ноября');
    expect(cal.days['2026-11-20'].slots[0].timeLabel).toBe('12:00–12:30'); // последний день окна
  });

  it('UTC-полночь относится к следующей настенной дате MSK', () => {
    const cal2 = buildBookingCalendar(
      [slot('2026-11-10T21:00:00.000Z', '2026-11-10T21:30:00.000Z')], // 11.11, 00:00 MSK
      MSK,
      NOW,
    );
    const withSlots = Object.entries(cal2.days).filter(([, d]) => d.slots.length > 0);
    expect(withSlots.map(([key]) => key)).toEqual(['2026-11-11']);
  });

  it('хвост 15-й даты периода GET не показывается: слоты вне окна отбрасываются', () => {
    // дефолт GET …/slots — [now; now + 14 дней] = до 21.11 15:00 MSK — надмножество
    // окна 7..20 ноября; слот утра 21.11 приходит в ответе, но не попадает в UI
    expect(cal.days['2026-11-21']).toBeUndefined();
    expect(cal.days['2026-12-05']).toBeUndefined();
    expect(
      Object.values(cal.days).every((d) => d.slots.every((s) => s.startsAt !== SLOTS[4].startsAt)),
    ).toBe(true);
  });

  it('дни окна без слотов тоже имеют заголовок — карточка дня не теряет название', () => {
    expect(cal.days['2026-11-09']).toEqual({
      dateKey: '2026-11-09',
      title: 'понедельник, 9 ноября',
      slots: [],
    });
  });

  it('сетка месяца: 42 клетки, неделя с понедельника, чужие месяцы — off', () => {
    const nov = cal.months[0];
    expect(nov.cells).toHaveLength(42);
    expect(nov.cells[0]).toMatchObject({ dayNumber: 26, state: 'off' }); // пн, 26 октября
    expect(nov.cells.at(-1)).toMatchObject({ dayNumber: 6, state: 'off' }); // вс, 6 декабря
  });

  it('прошедшие и вне окна — off, сегодня — точка, будущие без слотов — zero', () => {
    const byKey = new Map(cal.months[0].cells.map((c) => [c.dateKey, c]));
    expect(byKey.get('2026-11-06')?.state).toBe('off'); // вчера
    expect(byKey.get('2026-11-07')).toMatchObject({ state: 'zero', isToday: true });
    expect(byKey.get('2026-11-09')?.state).toBe('zero'); // завтра без слотов
    expect(byKey.get('2026-11-20')?.state).toBe('open'); // последний день окна — ещё в окне
  });

  it('день со слотами — open со счётчиком и aria-подписью', () => {
    const open = cal.months[0].cells.find((c) => c.dateKey === '2026-11-10');
    expect(open).toMatchObject({ state: 'open', count: 2 });
    expect(open?.label).toBe('вторник, 10 ноября, свободных окон: 2');
    const zero = cal.months[0].cells.find((c) => c.dateKey === '2026-11-09');
    expect(zero?.label).toBe('понедельник, 9 ноября, свободных окон нет');
  });

  it('окно через границу месяца: два месяца с сетками', () => {
    // «сегодня» 21.11 → окно 21.11..4.12
    const cross = buildBookingCalendar([], MSK, new Date('2026-11-21T09:00:00.000Z'));
    expect(cross.months.map((m) => m.key)).toEqual(['2026-11', '2026-12']);
    expect(cross.months[0].cells.filter((c) => c.state !== 'off')).toHaveLength(10);
    expect(cross.months[1].cells.filter((c) => c.state !== 'off')).toHaveLength(4);
  });

  it('без слотов месяцы и сетки остаются, открытых дней нет', () => {
    const empty = buildBookingCalendar([], MSK, NOW);
    // дни окна предсозданы пустыми — карточка дня знает своё название
    expect(Object.keys(empty.days)).toHaveLength(14); // 2026-11-07 … 2026-11-20
    expect(Object.values(empty.days).every((d) => d.slots.length === 0)).toBe(true);
    expect(empty.months.map((m) => m.key)).toEqual(['2026-11']);
    expect(empty.months.every((m) => m.cells.every((c) => c.state !== 'open'))).toBe(true);
  });

  it('пиннинг: дефолт GET …/slots накрывает окно записи до конца суток', () => {
    // связывает BOOKING_WINDOW_DAYS и DEFAULT_PERIOD_DAYS: расхождение
    // (окно длиннее дефолта) молча оставило бы последние дни пустыми
    const cal = buildBookingCalendar([], MSK, NOW);
    const query = parseSlotQuery({}, NOW);
    if (!query.ok) throw new Error('дефолтный запрос должен быть валиден');
    const windowEndsAt = new Date(`${cal.windowEndKey}T23:59:59.999+03:00`); // конец суток в MSK
    expect(windowEndsAt.getTime()).toBeLessThanOrEqual(query.value.to.getTime());
  });
});

describe('firstOpenDateKey', () => {
  it('первый открытый день календаря', () => {
    expect(firstOpenDateKey(buildBookingCalendar(SLOTS, MSK, NOW))).toBe('2026-11-10');
  });

  it('нет открытых дней — null', () => {
    expect(firstOpenDateKey(buildBookingCalendar([], MSK, NOW))).toBeNull();
  });
});

describe('countWindows', () => {
  it.each([
    [0, '0 окон'],
    [1, '1 окно'],
    [2, '2 окна'],
    [4, '4 окна'],
    [5, '5 окон'],
    [11, '11 окон'],
    [21, '21 окно'],
    [22, '22 окна'],
    [100, '100 окон'],
  ])('%i → «%s»', (n, expected) => {
    expect(countWindows(n)).toBe(expected);
  });
});

describe('humanDuration', () => {
  it.each([
    [15, '15 минут'],
    [30, '30 минут'],
    [45, '45 минут'],
    [60, '1 час'],
    [75, '1 час 15 минут'],
    [90, '1 час 30 минут'],
    [105, '1 час 45 минут'],
    [120, '2 часа'],
    [150, '2 часа 30 минут'],
    [165, '2 часа 45 минут'],
    [180, '3 часа'],
  ])('%i минут → «%s»', (minutes, expected) => {
    expect(humanDuration(minutes)).toBe(expected);
  });
});

describe('apiFailureFromError', () => {
  it('SLOT_ALREADY_BOOKED — занято другим посетителем', () => {
    expect(
      apiFailureFromError({ error: { code: 'SLOT_ALREADY_BOOKED', message: 'Слот занят' } }),
    ).toEqual({ kind: 'booked' });
  });

  it('SLOT_IN_PAST — слот начался', () => {
    expect(
      apiFailureFromError({ error: { code: 'SLOT_IN_PAST', message: 'Слот в прошлом' } }),
    ).toEqual({ kind: 'past' });
  });

  it('NOT_FOUND — тип события удалён', () => {
    expect(apiFailureFromError({ error: { code: 'NOT_FOUND', message: 'Тип не найден' } })).toEqual(
      {
        kind: 'gone',
      },
    );
  });

  it('VALIDATION_ERROR с details — ошибки по полям', () => {
    expect(
      apiFailureFromError({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Невалидное тело запроса',
          details: [
            { field: 'bookerName', message: 'обязательное поле' },
            { field: 'bookerContact', message: 'минимум 5 символов' },
          ],
        },
      }),
    ).toEqual({
      kind: 'invalid',
      fields: { bookerName: 'обязательное поле', bookerContact: 'минимум 5 символов' },
      messages: ['обязательное поле', 'минимум 5 символов'],
    });
  });

  it('VALIDATION_ERROR без details — общий текст', () => {
    expect(
      apiFailureFromError({
        error: { code: 'VALIDATION_ERROR', message: 'Невалидное тело запроса' },
      }),
    ).toEqual({ kind: 'invalid', fields: {}, messages: ['Невалидное тело запроса'] });
  });

  it('чужой код и мусорная форма — unknown', () => {
    expect(apiFailureFromError({ error: { code: 'SLOT_OVERLAP', message: 'X' } })).toEqual({
      kind: 'unknown',
    });
    expect(apiFailureFromError(null)).toEqual({ kind: 'unknown' });
    expect(apiFailureFromError({ foo: 1 })).toEqual({ kind: 'unknown' });
  });
});

describe('bookingBanner', () => {
  it('SLOT_ALREADY_BOOKED — текст как в старом флоу (сохранён)', () => {
    expect(bookingBanner({ kind: 'booked' })).toEqual({
      title: 'Это время только что заняли',
      text: 'Другой посетитель забронировал слот раньше вас. Список обновлён — выберите другое окно.',
    });
  });

  it('тип удалён — свой заголовок', () => {
    expect(bookingBanner({ kind: 'gone' })?.title).toBe('Вид брони больше не доступен');
  });

  it('сетевые и неизвестные сбои — свои заголовки', () => {
    expect(bookingBanner({ kind: 'network' })?.title).toBe('Не удалось связаться с сервером');
    expect(bookingBanner({ kind: 'unknown' })?.title).toBe('Не удалось забронировать звонок');
  });

  it('ошибки полей — не баннер (показываются у полей)', () => {
    expect(bookingBanner({ kind: 'invalid', fields: {}, messages: [] })).toBeNull();
  });
});
