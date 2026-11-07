import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  deleteBooking,
  futureWorkingSlotStart,
  getBookings,
  postBooking,
  seedEventTypeViaApi,
  silenceRequestLogs,
} from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): отмена брони — DELETE строки; время снова
// становится свободным для всех типов (US-07, ADR-0011).

setupTestDatabase();

describe('DELETE /api/v1/bookings/{id}', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('отменяет бронь: 204 без тела, из списка исчезает', async () => {
    const type = await seedEventTypeViaApi();
    const created = await postBooking({
      eventTypeId: type.id,
      startsAt: futureWorkingSlotStart().toISOString(), // пн 09:00 — валидный слот
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    const booking = schemas.BookingCreated.parse(await created.json());

    const response = await deleteBooking(booking.id);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');

    const list = schemas.BookingList.parse(await (await getBookings()).json());
    expect(list.bookings).toHaveLength(0);
  });

  it('неизвестный id → 404 NOT_FOUND', async () => {
    const response = await deleteBooking('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('после отмены интервал снова бронируется (примыкающий — тем более)', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 60 });
    const startsAt = futureWorkingSlotStart().toISOString(); // пн 09:00 — валидный слот

    const created = await postBooking({
      eventTypeId: type.id,
      startsAt,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    expect(created.status).toBe(201);

    const booking = schemas.BookingCreated.parse(await created.json());
    expect((await deleteBooking(booking.id)).status).toBe(204);

    const rebooked = await postBooking({
      eventTypeId: type.id,
      startsAt,
      bookerName: 'Пётр',
      bookerContact: 'email:petr@b.co',
    });
    expect(rebooked.status).toBe(201);
  });
});
