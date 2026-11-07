import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  deleteBooking,
  futureMondayMidnight,
  getEventTypeSlots,
  postBooking,
  putWorkingHours,
  seedEventTypeViaApi,
  silenceRequestLogs,
  weekHours,
} from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): вычисляемые слоты GET /event-types/{id}/slots
// (ADR-0011). Генерация — окно × рабочие часы × шаг = длительности (D2/D3);
// занятость — наложение с бронями любых типов (D12). Абсолютные даты
// безопасны: генератор не зависит от «сейчас» (окно задаёт запрос).

setupTestDatabase();

/** 2026-11-09 — понедельник; неделя 9..15 ноября. */
const NOV_9 = '2026-11-09T00:00:00+03:00';
const NOV_11 = '2026-11-11T00:00:00+03:00'; // полночь среды: среда в окне, но её старты после to
const NOV_15 = '2026-11-15T23:59:59+03:00';

function slotStarts(id: string, query = ''): Promise<string[]> {
  return getEventTypeSlots(id, query)
    .then((response) => {
      expect(response.status).toBe(200);
      return response.json();
    })
    .then((body) => schemas.SlotList.parse(body).slots.map((slot) => slot.startsAt));
}

describe('GET /api/v1/event-types/{id}/slots', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('неизвестный тип → 404 NOT_FOUND', async () => {
    const response = await getEventTypeSlots('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('дефолт часов D3: слоты в Пн–Пт 09:00–18:00 MSK, выходные пусты, шаг = длительности', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 60 });

    const starts = await slotStarts(
      type.id,
      `?from=${encodeURIComponent(NOV_9)}&to=${encodeURIComponent(NOV_15)}`,
    );

    // 5 рабочих дней × 9 стартов (09:00 … 17:00)
    expect(starts).toHaveLength(5 * 9);
    expect(starts[0]).toBe('2026-11-09T06:00:00.000Z');
    expect(starts.at(-1)).toBe('2026-11-13T14:00:00.000Z');

    const days = new Set(
      starts.map((start) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(start)),
      ),
    );
    expect([...days].sort()).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
  });

  it('шаг = длительности (D2): тип 120 минут — старты 09:00, 11:00, 13:00, 15:00', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 120 });

    const starts = await slotStarts(
      type.id,
      `?from=${encodeURIComponent(NOV_9)}&to=${encodeURIComponent(NOV_11)}`,
    );

    expect(starts).toEqual([
      '2026-11-09T06:00:00.000Z',
      '2026-11-09T08:00:00.000Z',
      '2026-11-09T10:00:00.000Z',
      '2026-11-09T12:00:00.000Z',
      '2026-11-10T06:00:00.000Z',
      '2026-11-10T08:00:00.000Z',
      '2026-11-10T10:00:00.000Z',
      '2026-11-10T12:00:00.000Z',
    ]);
  });

  it('заданные часы: границы и выходные из PUT, а не дефолт', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 30 });
    const put = await putWorkingHours({
      days: weekHours({ startMinutes: 10 * 60, endMinutes: 12 * 60 }, [1, 2, 3, 4, 5, 6]),
    });
    expect(put.status).toBe(200);

    const starts = await slotStarts(
      type.id,
      `?from=${encodeURIComponent(NOV_9)}&to=${encodeURIComponent(NOV_15)}`,
    );

    // работает только воскресенье: 10:00, 10:30, 11:00, 11:30
    expect(starts).toEqual([
      '2026-11-15T07:00:00.000Z',
      '2026-11-15T07:30:00.000Z',
      '2026-11-15T08:00:00.000Z',
      '2026-11-15T08:30:00.000Z',
    ]);
  });

  it('все дни выходные → пустой список', async () => {
    const type = await seedEventTypeViaApi();
    await putWorkingHours({
      days: weekHours({ startMinutes: 540, endMinutes: 1080 }, [0, 1, 2, 3, 4, 5, 6]),
    });

    expect(
      await slotStarts(
        type.id,
        `?from=${encodeURIComponent(NOV_9)}&to=${encodeURIComponent(NOV_15)}`,
      ),
    ).toEqual([]);
  });

  it('from/to: дефолт — 14 дней от сейчас; невалидные значения → 422', async () => {
    const type = await seedEventTypeViaApi();

    const response = await getEventTypeSlots(type.id);
    expect(response.status).toBe(200);
    const body = schemas.SlotList.parse(await response.json());
    expect(body.slots.every((slot) => new Date(slot.startsAt) > new Date(Date.now() - 1000))).toBe(
      true,
    );

    const notIso = await getEventTypeSlots(type.id, '?from=завтра');
    expect(notIso.status).toBe(422);
    const bodyNotIso = schemas.ErrorEnvelope.parse(await notIso.json());
    expect(bodyNotIso.error.code).toBe('VALIDATION_ERROR');
    expect(bodyNotIso.error.details?.[0]?.field).toBe('from');

    const inverted = await getEventTypeSlots(type.id, `?from=${NOV_15}&to=${NOV_9}`);
    expect(inverted.status).toBe(422);
    expect(schemas.ErrorEnvelope.parse(await inverted.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('бронь убирает слот из списка, отмена возвращает (включая брони других типов — D12)', async () => {
    const monday = futureMondayMidnight();
    const query = `?from=${monday.toISOString()}&to=${new Date(monday.getTime() + 7 * 24 * 3600 * 1000).toISOString()}`;
    const type30 = await seedEventTypeViaApi({ durationMinutes: 30 });
    const type60 = await seedEventTypeViaApi({ durationMinutes: 60 });

    const nine = new Date(monday.getTime() + 9 * 3600 * 1000); // 09:00 MSK
    const before = await slotStarts(type30.id, query);
    expect(before).toContain(nine.toISOString());
    const booked = await postBooking({
      eventTypeId: type60.id,
      startsAt: nine.toISOString(),
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    expect(booked.status).toBe(201);

    const during = await slotStarts(type30.id, query);
    expect(during).not.toContain(nine.toISOString());
    expect(during).not.toContain(new Date(nine.getTime() + 30 * 60 * 1000).toISOString());
    expect(during).toContain(new Date(nine.getTime() + 60 * 60 * 1000).toISOString()); // 10:00 свободно

    const booking = schemas.BookingCreated.parse(await booked.json());
    const cancelled = await deleteBooking(booking.id);
    expect(cancelled.status).toBe(204);

    expect(await slotStarts(type30.id, query)).toEqual(before);
  });
});
