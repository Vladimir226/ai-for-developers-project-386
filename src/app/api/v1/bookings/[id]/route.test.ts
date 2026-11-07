import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  deleteBooking,
  getBookings,
  postBooking,
  seedSlotViaApi,
  silenceRequestLogs,
} from '@/lib/testing/bookings-api';
import { getSlots } from '@/lib/testing/slots-api';
import { clearSlots, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): Route Handler вызывается напрямую, как это
// делал бы любой HTTP-клиент. БД — свежая временная SQLite (NFR-003).
// Каждый ответ парсится сгенерированной из контракта Zod-схемой (ADR-010).

setupTestDatabase();

describe('DELETE /api/v1/bookings/{id}', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('отменяет бронь: 204, слот снова в списке свободных, брони больше нет', async () => {
    const slot = await seedSlotViaApi();
    const bookingResponse = await postBooking({
      slotId: slot.id,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    const booking = schemas.BookingCreated.parse(await bookingResponse.json());

    const response = await deleteBooking(booking.id);

    expect(response.status).toBe(204);

    const free = schemas.SlotList.parse(await (await getSlots()).json());
    expect(free.slots.map((item) => item.id)).toContain(slot.id);

    const bookings = schemas.BookingList.parse(await (await getBookings()).json());
    expect(bookings.bookings).toHaveLength(0);
  });

  it('несуществующая бронь → 404 NOT_FOUND', async () => {
    const response = await deleteBooking('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
