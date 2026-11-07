import { describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';

// Шов 3 (unit, ADR-010): сгенерированные из контракта Zod-схемы — тот же
// парсер, которым integration-тесты (шов 1) будут проверять ответы сервера
// (#33). Здесь фиксируем ключевые свойства конверта ошибок (ADR-005) и
// моделей новой доменной модели (ADR-0011): случайная регрессия контракта
// (потерянный enum, обязательность полей, формат времени) уронит эти тесты
// до того, как разъедется сервер.

const validEventType = {
  id: '0ea3a3f5-6d21-4e5a-8f3e-91d3b1a4c22e',
  title: 'Консультация',
  durationMinutes: 30,
};

const validBooking = {
  id: '9c1f0a6e-3d4b-4a5c-8e7f-a1b2c3d4e5f6',
  eventType: validEventType,
  startsAt: '2026-11-08T10:00:00Z',
  endsAt: '2026-11-08T10:30:00Z',
  bookerName: 'Мария',
  bookerContact: '+7 900 000-00-00',
  createdAt: '2026-11-07T09:00:00Z',
};

describe('сгенерированные Zod-схемы (контракт)', () => {
  it('EventType: принимает валидный тип; режет мусор вместо ISO-времени там, где uuid, и невалидные границы', () => {
    expect(schemas.EventType.safeParse(validEventType).success).toBe(true);
    expect(schemas.EventType.safeParse({ ...validEventType, id: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(
      schemas.EventType.safeParse({ ...validEventType, durationMinutes: undefined }).success,
    ).toBe(false);
  });

  it('EventType: description необязателен, остальное обязательно', () => {
    expect(
      schemas.EventType.safeParse({ ...validEventType, description: 'Знакомство' }).success,
    ).toBe(true);
    expect(schemas.EventType.safeParse({ ...validEventType, title: undefined }).success).toBe(
      false,
    );
  });

  it('CreateEventTypeRequest / UpdateEventTypeRequest — общая форма черновика', () => {
    const draft = { title: 'Консультация', durationMinutes: 45 };
    expect(schemas.CreateEventTypeRequest.safeParse(draft).success).toBe(true);
    expect(schemas.UpdateEventTypeRequest.safeParse(draft).success).toBe(true);
    expect(schemas.CreateEventTypeRequest.safeParse({ ...draft, title: '' }).success).toBe(false);
  });

  it('SlotList: слоты вычисляемые — без id, только интервал', () => {
    expect(
      schemas.SlotList.safeParse({
        slots: [{ startsAt: '2026-11-08T10:00:00Z', endsAt: '2026-11-08T10:30:00Z' }],
      }).success,
    ).toBe(true);
    expect(schemas.SlotList.safeParse({ slots: [] }).success).toBe(true);
    expect(schemas.SlotList.safeParse({}).success).toBe(false);
  });

  it('WorkingHours: дни недели с минутами или выходные', () => {
    const workingHours = {
      days: [
        { weekday: 1, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 0, isDayOff: true },
      ],
    };
    expect(schemas.WorkingHours.safeParse(workingHours).success).toBe(true);
    expect(schemas.WorkingHoursDay.safeParse({ weekday: 7, isDayOff: true }).success).toBe(false);
  });

  it('Booking: вложенный eventType, comment необязателен, остальные поля обязательны', () => {
    expect(schemas.Booking.safeParse(validBooking).success).toBe(true);
    expect(
      schemas.Booking.safeParse({ ...validBooking, comment: 'перезвоните позже' }).success,
    ).toBe(true);
    expect(schemas.Booking.safeParse({ ...validBooking, eventType: undefined }).success).toBe(
      false,
    );
    expect(schemas.Booking.safeParse({ ...validBooking, bookerName: undefined }).success).toBe(
      false,
    );
  });

  it('CreateBookingRequest: eventTypeId вместо slotId (ADR-0011)', () => {
    expect(
      schemas.CreateBookingRequest.safeParse({
        eventTypeId: validEventType.id,
        startsAt: '2026-11-08T10:00:00Z',
        bookerName: 'Мария',
        bookerContact: '+7 900 000-00-00',
      }).success,
    ).toBe(true);
    expect(schemas.CreateBookingRequest.safeParse({ slotId: validEventType.id }).success).toBe(
      false,
    );
  });

  it('Конверт ошибок (ADR-005): принимает все стабильные коды, режет неизвестный', () => {
    for (const code of ['VALIDATION_ERROR', 'NOT_FOUND', 'SLOT_ALREADY_BOOKED', 'SLOT_IN_PAST']) {
      const result = schemas.ErrorEnvelope.safeParse({
        error: { code, message: 'Сообщение' },
      });
      expect(result.success, `код ${code}`).toBe(true);
    }

    expect(
      schemas.ErrorEnvelope.safeParse({ error: { code: 'SOMETHING_ELSE', message: 'x' } }).success,
    ).toBe(false);
  });

  it('Конверт ошибок: details — список field/message для VALIDATION_ERROR', () => {
    const envelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Невалидные поля',
        details: [{ field: 'durationMinutes', message: 'должно быть 15..180' }],
      },
    };
    expect(schemas.ErrorEnvelope.parse(envelope)).toEqual(envelope);
    expect(
      schemas.ErrorEnvelope.safeParse({
        error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 42 }] },
      }).success,
    ).toBe(false);
  });
});
