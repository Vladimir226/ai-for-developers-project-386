import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  getBookings,
  postBooking,
  seedSlotViaApi,
  silenceRequestLogs,
} from '@/lib/testing/bookings-api';
import { deleteSlot, futureIso, getSlots, postSlot } from '@/lib/testing/slots-api';
import { clearSlots, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): Route Handler вызывается напрямую, как это
// делал бы любой HTTP-клиент. БД — свежая временная SQLite (NFR-003).
// Каждый ответ парсится сгенерированной из контракта Zod-схемой — конформанс
// TypeSpec-контракту (#12, ADR-010) проверяется каждым тестом.

setupTestDatabase();

describe('POST /api/v1/bookings', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('бронирует свободный слот: 201, тело — бронь по контракту со временем слота', async () => {
    const slot = await seedSlotViaApi();

    const response = await postBooking({
      slotId: slot.id,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
      comment: 'Тема — обсудить оффер',
    });

    expect(response.status).toBe(201);

    const body = schemas.BookingCreated.parse(await response.json());
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.slotId).toBe(slot.id);
    // startsAt/endsAt — копия из слота (модель Booking, контракт #12)
    expect(body.startsAt).toBe(slot.startsAt);
    expect(body.endsAt).toBe(slot.endsAt);
    expect(body.bookerName).toBe('Мария');
    expect(body.bookerContact).toBe('telegram: @maria');
    expect(body.comment).toBe('Тема — обсудить оффер');
  });

  it('бронь несуществующего слота → 404 NOT_FOUND', async () => {
    const response = await postBooking({
      slotId: '00000000-0000-4000-8000-000000000000',
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(404);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('слот уже начался → 409 SLOT_IN_PAST', async () => {
    const { getDb } = await import('@/lib/db/prisma');
    const db = await getDb();
    // сеяние прошедшего слота напрямую: продакшн-путь такое не создаёт
    const slot = await db.slot.create({
      data: {
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await postBooking({
      slotId: slot.id,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('SLOT_IN_PAST');
  });

  it('слот и в прошлом, и занят → 409 SLOT_IN_PAST (приоритет, аддендум #6)', async () => {
    const { getDb } = await import('@/lib/db/prisma');
    const db = await getDb();
    const slot = await db.slot.create({
      data: {
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    await db.booking.create({
      data: { slotId: slot.id, bookerName: 'Прошлый', bookerContact: 'email:a@b.co' },
    });

    const response = await postBooking({
      slotId: slot.id,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('SLOT_IN_PAST');
  });

  it('слот уже забронирован → 409 SLOT_ALREADY_BOOKED', async () => {
    const slot = await seedSlotViaApi();
    const first = await postBooking({
      slotId: slot.id,
      bookerName: 'Первый',
      bookerContact: 'email:first@b.co',
    });
    expect(first.status).toBe(201);

    const response = await postBooking({
      slotId: slot.id,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('SLOT_ALREADY_BOOKED');
  });

  it('гонка: N параллельных POST на один слот → ровно один 201, остальные 409 (гарантия БД)', async () => {
    const slot = await seedSlotViaApi();
    const N = 8;

    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        postBooking({
          slotId: slot.id,
          bookerName: `Посетитель ${i}`,
          bookerContact: `phone:+7900000000${i}`,
        }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(N - 1);

    for (const response of responses.filter((response) => response.status === 409)) {
      const body = schemas.ErrorEnvelope.parse(await response.json());
      expect(body.error.code).toBe('SLOT_ALREADY_BOOKED');
    }
  });
});

describe('GET /api/v1/bookings', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('возвращает брони с временем слота и данными посетителя, по возрастанию начала', async () => {
    const early = await seedSlotViaApi();
    const lateResponse = await postSlot({ startsAt: futureIso(48), endsAt: futureIso(49) });
    const late = schemas.SlotCreated.parse(await lateResponse.json());

    // бронируем в обратном порядке — порядок ответа задаёт слот, не создание
    await postBooking({
      slotId: late.id,
      bookerName: 'Пётр',
      bookerContact: 'email:petr@b.co',
      comment: 'Второй',
    });
    await postBooking({
      slotId: early.id,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });

    const response = await getBookings();

    expect(response.status).toBe(200);

    const body = schemas.BookingList.parse(await response.json());
    expect(body.bookings).toHaveLength(2);
    expect(body.bookings[0]).toMatchObject({
      slotId: early.id,
      startsAt: early.startsAt,
      endsAt: early.endsAt,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    expect(body.bookings[0].comment).toBeUndefined();
    expect(body.bookings[1]).toMatchObject({
      slotId: late.id,
      bookerName: 'Пётр',
      comment: 'Второй',
    });
  });
});

describe('бронь и список свободных слотов (US-12)', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('забронированный слот исчезает из view=free и остаётся в view=all', async () => {
    const slot = await seedSlotViaApi();
    const booking = await postBooking({
      slotId: slot.id,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    expect(booking.status).toBe(201);

    const free = schemas.SlotList.parse(await (await getSlots()).json());
    expect(free.slots.map((item) => item.id)).not.toContain(slot.id);

    const all = schemas.SlotList.parse(await (await getSlots('?view=all')).json());
    expect(all.slots.map((item) => item.id)).toContain(slot.id);
  });

  it('удаление слота каскадно удаляет связанную бронь (US-05)', async () => {
    const slot = await seedSlotViaApi();
    const booking = await postBooking({
      slotId: slot.id,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });
    expect(booking.status).toBe(201);

    const deletion = await deleteSlot(slot.id);
    expect(deletion.status).toBe(204);

    const bookings = schemas.BookingList.parse(await (await getBookings()).json());
    expect(bookings.bookings).toHaveLength(0);
  });

  it('невалидные поля (имя 1..100, контакт 5..200, комментарий ≤500) → 422 с field/message', async () => {
    const slot = await seedSlotViaApi();

    const response = await postBooking({
      slotId: slot.id,
      bookerName: '',
      bookerContact: 'a@b',
      comment: 'x'.repeat(501),
    });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const fields = body.error.details?.map((item) => item.field);
    expect(fields).toContain('bookerName');
    expect(fields).toContain('bookerContact');
    expect(fields).toContain('comment');
  });

  it('битый JSON → 422 VALIDATION_ERROR', async () => {
    const response = await postBooking('{не-json');

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
