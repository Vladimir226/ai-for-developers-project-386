import { describe, expect, it } from 'vitest';
import { findOverlappingSlot, outcomeFromApiError, slotStatus } from './admin-logic';

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
