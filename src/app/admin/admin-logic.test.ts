import { describe, expect, it } from 'vitest';
import {
  adminWindow,
  buildBookingCards,
  cancelNoticeText,
  cancelOutcomeFromApiError,
  findOverlappingSlot,
  outcomeFromApiError,
  slotStatus,
  type BookingLike,
} from './admin-logic';

// Шов 3 (unit): чистая логика админ-страницы (ADR-004: тонкий UI) —
// статус слота для бейджа макета, разбор конверта ошибок (ADR-005) и
// подсказка «пересекается с …». Ожидания — literals, не пересчёт.

const NOW = new Date('2026-11-10T12:00:00.000Z'); // вт

describe('slotStatus', () => {
  it('будущий слот без брони — свободен', () => {
    const slot = { id: 'slot-1', startsAt: '2026-11-11T09:00:00Z', endsAt: '2026-11-11T09:30:00Z' };
    expect(slotStatus(slot, new Set(), NOW)).toBe('free');
  });

  it('слот с активной бронью — забронирован', () => {
    const slot = { id: 'slot-1', startsAt: '2026-11-11T09:00:00Z', endsAt: '2026-11-11T09:30:00Z' };
    expect(slotStatus(slot, new Set(['slot-1']), NOW)).toBe('booked');
  });

  it('закончившийся слот — прошёл, даже если был забронирован', () => {
    const slot = { id: 'slot-1', startsAt: '2026-11-10T09:00:00Z', endsAt: '2026-11-10T09:30:00Z' };
    expect(slotStatus(slot, new Set(), NOW)).toBe('past');
    expect(slotStatus(slot, new Set(['slot-1']), NOW)).toBe('past');
  });

  it('идущий прямо сейчас слот — ещё не прошёл', () => {
    const slot = { id: 'slot-1', startsAt: '2026-11-10T11:00:00Z', endsAt: '2026-11-10T13:00:00Z' };
    expect(slotStatus(slot, new Set(), NOW)).toBe('free');
  });
});

describe('adminWindow', () => {
  it('покрывает всё: от эпохи до далёкого будущего — «все опубликованные»', () => {
    // FR-002 «видит список всех опубликованных интервалов»: дефолтное окно
    // API (now..now+31д) скрыло бы прошедшие и дальние интервалы
    expect(adminWindow()).toEqual({
      from: '1970-01-01T00:00:00.000Z',
      to: '9999-12-31T23:59:59.999Z',
    });
  });
});

describe('outcomeFromApiError', () => {
  it('SLOT_OVERLAP — пересечение', () => {
    expect(
      outcomeFromApiError({ error: { code: 'SLOT_OVERLAP', message: 'Интервал пересекается' } }),
    ).toEqual({ kind: 'overlap' });
  });

  it('VALIDATION_ERROR с details — сообщения полей', () => {
    expect(
      outcomeFromApiError({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Невалидное тело запроса',
          details: [
            { field: 'startsAt', message: 'начало должно быть в будущем' },
            { field: 'endsAt', message: 'конец должен быть позже начала' },
          ],
        },
      }),
    ).toEqual({
      kind: 'invalid',
      messages: ['начало должно быть в будущем', 'конец должен быть позже начала'],
    });
  });

  it('VALIDATION_ERROR без details — общий текст ошибки', () => {
    expect(
      outcomeFromApiError({
        error: { code: 'VALIDATION_ERROR', message: 'Невалидное тело запроса' },
      }),
    ).toEqual({ kind: 'invalid', messages: ['Невалидное тело запроса'] });
  });

  it('чужой код и мусорная форма — unknown', () => {
    expect(outcomeFromApiError({ error: { code: 'NOT_FOUND', message: 'Нет' } })).toEqual({
      kind: 'unknown',
    });
    expect(outcomeFromApiError(null)).toEqual({ kind: 'unknown' });
    expect(outcomeFromApiError({ foo: 1 })).toEqual({ kind: 'unknown' });
  });
});

describe('findOverlappingSlot', () => {
  const slots = [
    { id: 'a', startsAt: '2026-11-11T08:00:00Z', endsAt: '2026-11-11T08:30:00Z' },
    { id: 'b', startsAt: '2026-11-11T11:00:00Z', endsAt: '2026-11-11T11:30:00Z' },
  ];

  it('пересекающийся кандидат — первый конфликтующий слот', () => {
    expect(
      findOverlappingSlot(
        { startsAt: '2026-11-11T08:15:00Z', endsAt: '2026-11-11T09:00:00Z' },
        slots,
      ),
    ).toBe(slots[0]);
  });

  it('вплотную соседний (конец == начало) — не конфликт', () => {
    expect(
      findOverlappingSlot(
        { startsAt: '2026-11-11T08:30:00Z', endsAt: '2026-11-11T09:00:00Z' },
        slots,
      ),
    ).toBeUndefined();
  });

  it('без пересечений — undefined', () => {
    expect(
      findOverlappingSlot(
        { startsAt: '2026-11-11T09:30:00Z', endsAt: '2026-11-11T10:00:00Z' },
        slots,
      ),
    ).toBeUndefined();
    expect(
      findOverlappingSlot({ startsAt: '2026-11-11T09:30:00Z', endsAt: '2026-11-11T10:00:00Z' }, []),
    ).toBeUndefined();
  });
});

// Бронь в JSON-форме контракта (Booking из models.tsp) — только поля карточки.
const BOOKING = {
  id: 'booking-1',
  slotId: 'slot-1',
  startsAt: '2026-11-10T07:30:00.000Z',
  endsAt: '2026-11-10T08:00:00.000Z',
  bookerName: 'Мария Иванова',
  bookerContact: 'maria@example.com',
  comment: 'Хочу обсудить сотрудничество',
  createdAt: '2026-11-07T10:00:00.000Z',
};

describe('buildBookingCards', () => {
  it('карточка брони: интервал в APP_TZ и поля посетителя', () => {
    expect(buildBookingCards([BOOKING], 'Europe/Moscow')).toEqual([
      {
        id: 'booking-1',
        bookerName: 'Мария Иванова',
        bookerContact: 'maria@example.com',
        comment: 'Хочу обсудить сотрудничество',
        timeLabel: 'вт, 10 ноября · 10:30–11:00',
      },
    ]);
  });

  it('бронь без комментария — comment: null, не пустая строка', () => {
    const withoutComment: BookingLike = { ...BOOKING };
    delete withoutComment.comment; // сервер не отдаёт ключ при null (serializeBooking)
    expect(buildBookingCards([withoutComment], 'Europe/Moscow')).toEqual([
      {
        id: 'booking-1',
        bookerName: 'Мария Иванова',
        bookerContact: 'maria@example.com',
        comment: null,
        timeLabel: 'вт, 10 ноября · 10:30–11:00',
      },
    ]);
  });

  it('порядок сервера сохраняется (сортировка — задача API, FR-002)', () => {
    const second = { ...BOOKING, id: 'booking-2', startsAt: '2026-11-12T07:00:00.000Z' };
    expect(buildBookingCards([BOOKING, second], 'Europe/Moscow')?.map((c) => c.id)).toEqual([
      'booking-1',
      'booking-2',
    ]);
  });

  it('null (само-фетч не удался) и пустой список проходят насквозь', () => {
    expect(buildBookingCards(null, 'Europe/Moscow')).toBeNull();
    expect(buildBookingCards([], 'Europe/Moscow')).toEqual([]);
  });
});

describe('cancelOutcomeFromApiError', () => {
  it('NOT_FOUND — бронь уже не существует (отменена в другом окне)', () => {
    expect(
      cancelOutcomeFromApiError({ error: { code: 'NOT_FOUND', message: 'Бронь не найдена' } }),
    ).toBe('already-gone');
  });

  it('чужой код и мусорная форма — unknown', () => {
    expect(
      cancelOutcomeFromApiError({ error: { code: 'SLOT_OVERLAP', message: 'Пересечение' } }),
    ).toBe('unknown');
    expect(cancelOutcomeFromApiError(null)).toBe('unknown');
    expect(cancelOutcomeFromApiError({ foo: 1 })).toBe('unknown');
  });
});

describe('cancelNoticeText', () => {
  it('already-gone — русский текст с причиной', () => {
    expect(cancelNoticeText('already-gone')).toBe(
      'Бронь уже отменена — возможно, в другом окне. Список показывает актуальное состояние.',
    );
  });

  it('остальные исходы — без уведомления: достаточно refresh', () => {
    expect(cancelNoticeText('unknown')).toBeNull();
    expect(cancelNoticeText('cancelled')).toBeNull();
  });
});
