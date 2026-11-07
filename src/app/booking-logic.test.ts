import { describe, expect, it } from 'vitest';
import { parseSlotQuery } from '@/lib/validation/slot';
import {
  bookingBanner,
  bookingFailureFromApiError,
  buildBookingCalendar,
  countWindows,
  firstOpenDateKey,
} from './booking-logic';

// Шов 3 (unit): чистая логика публичной страницы (ADR-004: тонкий UI) —
// группировка свободных слотов по настенным дням APP_TZ (ADR-009), сетка
// календаря из макета #13, плюрализация «окно», разбор конверта ошибок
// брони (ADR-005). Ожидания — literals, не пересчёт.

const MSK = 'Europe/Moscow';
const NOW = new Date('2026-11-07T12:00:00.000Z'); // суббота, 15:00 MSK

function slot(id: string, startsAt: string, endsAt: string) {
  return { id, startsAt, endsAt };
}

const SLOTS = [
  slot('s1', '2026-11-10T07:00:00Z', '2026-11-10T07:30:00Z'), // вт 10.11, 10:00–10:30 MSK
  slot('s2', '2026-11-10T07:30:00Z', '2026-11-10T08:00:00Z'), // вт 10.11, 10:30–11:00 MSK
  slot('s3', '2026-11-11T12:00:00Z', '2026-11-11T12:30:00Z'), // ср 11.11, 15:00–15:30 MSK
  slot('s4', '2026-12-05T09:00:00Z', '2026-12-05T09:30:00Z'), // сб 5.12, 12:00–12:30 MSK — вне окна
  slot('s5', '2026-11-20T09:00:00Z', '2026-11-20T09:30:00Z'), // пт 20.11, 12:00–12:30 MSK — последний день окна
];

describe('buildBookingCalendar', () => {
  const cal = buildBookingCalendar(SLOTS, MSK, NOW);

  it('окно — 14 настенных дат включая сегодня (макет #13: 7→20 ноября)', () => {
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
      [slot('n', '2026-11-10T21:00:00Z', '2026-11-10T21:30:00Z')], // 11.11, 00:00 MSK
      MSK,
      NOW,
    );
    const withSlots = Object.entries(cal2.days).filter(([, d]) => d.slots.length > 0);
    expect(withSlots.map(([key]) => key)).toEqual(['2026-11-11']);
  });

  it('дни окна без окон тоже имеют заголовок — карточка дня не теряет название', () => {
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

  it('прошедшие и вне окна — off, сегодня — точка, будущие без окон — zero', () => {
    const byKey = new Map(cal.months[0].cells.map((c) => [c.dateKey, c]));
    expect(byKey.get('2026-11-06')?.state).toBe('off'); // вчера
    expect(byKey.get('2026-11-07')).toMatchObject({ state: 'zero', isToday: true });
    expect(byKey.get('2026-11-09')?.state).toBe('zero'); // завтра без окон
    expect(byKey.get('2026-11-19')?.state).toBe('zero'); // предпоследний день окна без окон
    expect(byKey.get('2026-11-20')?.state).toBe('open'); // последний день окна — ещё в окне
  });

  it('день со слотами — open со счётчиком и aria-подписью', () => {
    const open = cal.months[0].cells.find((c) => c.dateKey === '2026-11-10');
    expect(open).toMatchObject({ state: 'open', count: 2 });
    expect(open?.label).toBe('вторник, 10 ноября, свободных окон: 2');
    const zero = cal.months[0].cells.find((c) => c.dateKey === '2026-11-09');
    expect(zero?.label).toBe('понедельник, 9 ноября, свободных окон нет');
  });

  it('за пределами окна: 21 ноября и дальше — off, слот вне окна не показан', () => {
    const byKey = new Map(cal.months[0].cells.map((c) => [c.dateKey, c]));
    expect(byKey.get('2026-11-21')?.state).toBe('off'); // первый день за окном
    expect(byKey.get('2026-11-30')?.state).toBe('off');
    expect(byKey.get('2026-12-05')?.state).toBe('off'); // слот s4 есть, но окно кончилось
    expect(cal.days['2026-12-05']).toBeUndefined();
  });

  it('без слотов месяцы и сетки остаются, открытых дней нет', () => {
    const empty = buildBookingCalendar([], MSK, NOW);
    // дни окна предсозданы пустыми — карточка дня знает своё название
    expect(Object.keys(empty.days)).toHaveLength(14); // 2026-11-07 … 2026-11-20
    expect(Object.values(empty.days).every((d) => d.slots.length === 0)).toBe(true);
    expect(empty.months.map((m) => m.key)).toEqual(['2026-11']);
    expect(empty.months.every((m) => m.cells.every((c) => c.state !== 'open'))).toBe(true);
  });

  it('пиннинг: дефолт GET /api/v1/slots накрывает окно записи до конца суток', () => {
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

describe('bookingFailureFromApiError', () => {
  it('SLOT_ALREADY_BOOKED — занято другим посетителем', () => {
    expect(
      bookingFailureFromApiError({ error: { code: 'SLOT_ALREADY_BOOKED', message: 'Слот занят' } }),
    ).toEqual({ kind: 'booked' });
  });

  it('SLOT_IN_PAST — окно началось', () => {
    expect(
      bookingFailureFromApiError({ error: { code: 'SLOT_IN_PAST', message: 'Слот в прошлом' } }),
    ).toEqual({ kind: 'past' });
  });

  it('NOT_FOUND — слот удалён', () => {
    expect(
      bookingFailureFromApiError({ error: { code: 'NOT_FOUND', message: 'Слот не найден' } }),
    ).toEqual({ kind: 'gone' });
  });

  it('VALIDATION_ERROR с details — ошибки по полям', () => {
    expect(
      bookingFailureFromApiError({
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
      bookingFailureFromApiError({
        error: { code: 'VALIDATION_ERROR', message: 'Невалидное тело запроса' },
      }),
    ).toEqual({ kind: 'invalid', fields: {}, messages: ['Невалидное тело запроса'] });
  });

  it('чужой код и мусорная форма — unknown', () => {
    expect(bookingFailureFromApiError({ error: { code: 'SLOT_OVERLAP', message: 'X' } })).toEqual({
      kind: 'unknown',
    });
    expect(bookingFailureFromApiError(null)).toEqual({ kind: 'unknown' });
    expect(bookingFailureFromApiError({ foo: 1 })).toEqual({ kind: 'unknown' });
  });
});

describe('bookingBanner', () => {
  it('SLOT_ALREADY_BOOKED — текст макета #13', () => {
    expect(bookingBanner({ kind: 'booked' })).toEqual({
      title: 'Это время только что заняли',
      text: 'Другой посетитель забронировал слот раньше вас. Список обновлён — выберите другое окно.',
    });
  });

  it('сетевые и неизвестные сбои — свои заголовки', () => {
    expect(bookingBanner({ kind: 'network' })?.title).toBe('Не удалось связаться с сервером');
    expect(bookingBanner({ kind: 'unknown' })?.title).toBe('Не удалось забронировать звонок');
  });

  it('ошибки полей — не баннер (показываются у полей)', () => {
    expect(bookingBanner({ kind: 'invalid', fields: {}, messages: [] })).toBeNull();
  });
});
