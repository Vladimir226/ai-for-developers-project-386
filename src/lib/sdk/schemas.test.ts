import { describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';

// Шов 3 (unit, ADR-010): сгенерированные из контракта Zod-схемы — тот же
// парсер, которым integration-тесты (шов 1) будут проверять ответы сервера.
// Здесь фиксируем ключевые свойства конверта ошибок (ADR-005) и моделей —
// случайная регрессия контракта (потерянный enum, обязательность полей,
// формат времени) уронит эти тесты до того, как разъедется сервер.

const validSlot = {
  id: '0ea3a3f5-6d21-4e5a-8f3e-91d3b1a4c22e',
  startsAt: '2026-11-08T10:00:00Z',
  endsAt: '2026-11-08T10:30:00Z',
};

const validBooking = {
  id: '9c1f0a6e-3d4b-4a5c-8e7f-a1b2c3d4e5f6',
  slotId: validSlot.id,
  startsAt: '2026-11-08T10:00:00Z',
  endsAt: '2026-11-08T10:30:00Z',
  bookerName: 'Мария',
  bookerContact: '+7 900 000-00-00',
  createdAt: '2026-11-07T09:00:00Z',
};

describe('сгенерированные Zod-схемы (контракт)', () => {
  it('Slot: принимает валидный слот; режет мусор вместо ISO-времени и невалидный UUID', () => {
    expect(schemas.Slot.safeParse(validSlot).success).toBe(true);
    expect(schemas.Slot.safeParse({ ...validSlot, startsAt: 'завтра' }).success).toBe(false);
    expect(schemas.Slot.safeParse({ ...validSlot, id: 'not-a-uuid' }).success).toBe(false);
    expect(schemas.Slot.safeParse({ ...validSlot, endsAt: undefined }).success).toBe(false);
  });

  it('SlotList и CreateSlotRequest соответствуют формам списка и запроса', () => {
    expect(schemas.SlotList.safeParse({ slots: [validSlot] }).success).toBe(true);
    expect(schemas.SlotList.safeParse({ slots: [] }).success).toBe(true);
    expect(schemas.SlotList.safeParse({}).success).toBe(false);
    expect(
      schemas.CreateSlotRequest.safeParse({
        startsAt: '2026-11-08T10:00:00Z',
        endsAt: '2026-11-08T10:30:00Z',
      }).success,
    ).toBe(true);
  });

  it('Booking: comment необязателен, остальные поля обязательны', () => {
    expect(schemas.Booking.safeParse(validBooking).success).toBe(true);
    expect(
      schemas.Booking.safeParse({ ...validBooking, comment: 'перезвоните позже' }).success,
    ).toBe(true);
    expect(schemas.Booking.safeParse({ ...validBooking, bookerName: undefined }).success).toBe(
      false,
    );
  });

  it('Конверт ошибок (ADR-005): принимает все стабильные коды, режет неизвестный', () => {
    for (const code of [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'SLOT_OVERLAP',
      'SLOT_ALREADY_BOOKED',
      'SLOT_IN_PAST',
    ]) {
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
        details: [{ field: 'startsAt', message: 'должно быть в будущем' }],
      },
    };
    expect(schemas.ErrorEnvelope.parse(envelope)).toEqual(envelope);
    expect(
      schemas.ErrorEnvelope.safeParse({
        error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 42 }] },
      }).success,
    ).toBe(false);
  });

  it('SlotView — только free|all', () => {
    expect(schemas.SlotView.safeParse('free').success).toBe(true);
    expect(schemas.SlotView.safeParse('all').success).toBe(true);
    expect(schemas.SlotView.safeParse('everything').success).toBe(false);
  });
});
