import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import { getDb } from '@/lib/db/prisma';
import {
  futureIso,
  getBookings,
  postBooking,
  pastIso,
  seedEventTypeViaApi,
  silenceRequestLogs,
  startOfSecond,
} from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): брони по контракту v2. Занятость —
// наложение полуинтервалов с любой активной бронью, включая другие типы
// (D12); примыкание допустимо. Гонка — транзакция с предикатом на
// одиночном писателе SQLite: ровно один 201, остальные 409.

setupTestDatabase();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('POST /api/v1/bookings', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('бронирует интервал: 201, тело — Booking по контракту, endsAt = startsAt + длительность типа', async () => {
    const type = await seedEventTypeViaApi({ title: 'Консультация', durationMinutes: 45 });
    const startsAt = startOfSecond(Date.now() + 48 * 3600 * 1000);
    // то же мгновение, записанное со смещением +03:00 (стенные часы зоны)
    const withOffset = new Date(startsAt.getTime() + 3 * 3600 * 1000)
      .toISOString()
      .replace('Z', '+03:00');

    const response = await postBooking({
      eventTypeId: type.id,
      startsAt: withOffset,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
      comment: 'Тема — обсудить оффер',
    });

    expect(response.status).toBe(201);

    const body = schemas.BookingCreated.parse(await response.json());
    expect(body.id).toMatch(UUID_RE);
    // нормализация в UTC (ADR-009): смещение во входе → Z в ответе
    expect(body.startsAt).toBe(startsAt.toISOString());
    expect(body.endsAt).toBe(new Date(startsAt.getTime() + 45 * 60 * 1000).toISOString());
    expect(body.eventType).toEqual({
      id: type.id,
      title: 'Консультация',
      durationMinutes: 45,
    });
    expect(body.bookerName).toBe('Мария');
    expect(body.bookerContact).toBe('telegram: @maria');
    expect(body.comment).toBe('Тема — обсудить оффер');
  });

  it('неизвестный тип → 404 NOT_FOUND (приоритет выше «в прошлом»)', async () => {
    const response = await postBooking({
      eventTypeId: '00000000-0000-4000-8000-000000000000',
      startsAt: pastIso(24),
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('начало в прошлом → 409 SLOT_IN_PAST', async () => {
    const type = await seedEventTypeViaApi();

    const response = await postBooking({
      eventTypeId: type.id,
      startsAt: pastIso(1),
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('SLOT_IN_PAST');
  });

  it('наложение с бронью того же типа → 409 SLOT_ALREADY_BOOKED с понятным сообщением', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 60 });
    const first = await postBooking({
      eventTypeId: type.id,
      startsAt: futureIso(48),
      bookerName: 'Первый',
      bookerContact: 'email:first@b.co',
    });
    expect(first.status).toBe(201);

    const response = await postBooking({
      eventTypeId: type.id,
      startsAt: futureIso(48.5),
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('SLOT_ALREADY_BOOKED');
    expect(body.error.message).toEqual(expect.stringContaining('пересекается'));
  });

  it('D12 межтиповое наложение: 60 мин @10:00 + 30 мин @10:30 → 409; примыкающее @11:00 → 201', async () => {
    const type60 = await seedEventTypeViaApi({ title: 'Час', durationMinutes: 60 });
    const type30 = await seedEventTypeViaApi({ title: 'Полчаса', durationMinutes: 30 });
    const at10 = futureIso(48);

    const first = await postBooking({
      eventTypeId: type60.id,
      startsAt: at10,
      bookerName: 'Первый',
      bookerContact: 'email:first@b.co',
    });
    expect(first.status).toBe(201);

    const at1030 = new Date(new Date(at10).getTime() + 30 * 60 * 1000).toISOString();
    const overlapping = await postBooking({
      eventTypeId: type30.id,
      startsAt: at1030,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });
    expect(overlapping.status).toBe(409);
    expect(schemas.ErrorEnvelope.parse(await overlapping.json()).error.code).toBe(
      'SLOT_ALREADY_BOOKED',
    );

    const at1100 = new Date(new Date(at10).getTime() + 60 * 60 * 1000).toISOString();
    const adjacent = await postBooking({
      eventTypeId: type30.id,
      startsAt: at1100,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });
    expect(adjacent.status).toBe(201);
  });

  it('интервал, вложенный в существующую бронь, тоже наложение → 409', async () => {
    const type60 = await seedEventTypeViaApi({ durationMinutes: 60 });
    const type15 = await seedEventTypeViaApi({ durationMinutes: 15 });
    const at10 = futureIso(48);

    const first = await postBooking({
      eventTypeId: type60.id,
      startsAt: at10,
      bookerName: 'Первый',
      bookerContact: 'email:first@b.co',
    });
    expect(first.status).toBe(201);

    const inside = new Date(new Date(at10).getTime() + 15 * 60 * 1000).toISOString();
    const response = await postBooking({
      eventTypeId: type15.id,
      startsAt: inside,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });

    expect(response.status).toBe(409);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe(
      'SLOT_ALREADY_BOOKED',
    );
  });

  it('гонка: 8 параллельных POST на одно окно → ровно один 201, остальные 409 (транзакция с предикатом)', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 30 });
    const startsAt = futureIso(48);
    const N = 8;

    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        postBooking({
          eventTypeId: type.id,
          startsAt,
          bookerName: `Гость ${i}`,
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

    const db = await getDb();
    expect(await db.booking.count()).toBe(1);
  });

  it('невалидные поля → 422 с field/message по каждому полю', async () => {
    const type = await seedEventTypeViaApi();

    const response = await postBooking({
      eventTypeId: type.id,
      startsAt: 'завтра',
      bookerName: '',
      bookerContact: 'a@b',
      comment: 'x'.repeat(501),
    });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const fields = body.error.details?.map((item) => item.field);
    expect(fields).toContain('startsAt');
    expect(fields).toContain('bookerName');
    expect(fields).toContain('bookerContact');
    expect(fields).toContain('comment');
  });

  it('битый JSON → 422 VALIDATION_ERROR', async () => {
    const response = await postBooking('{не-json');

    expect(response.status).toBe(422);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/bookings', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('возвращает брони с вложенным типом по возрастанию начала; comment без значения опущен', async () => {
    const type = await seedEventTypeViaApi({ title: 'Консультация', durationMinutes: 30 });
    const early = futureIso(24);
    const late = futureIso(48);

    // бронируем в обратном порядке — порядок ответа задаёт начало, не создание
    await postBooking({
      eventTypeId: type.id,
      startsAt: late,
      bookerName: 'Пётр',
      bookerContact: 'email:petr@b.co',
      comment: 'Второй',
    });
    await postBooking({
      eventTypeId: type.id,
      startsAt: early,
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });

    const response = await getBookings();

    expect(response.status).toBe(200);

    const body = schemas.BookingList.parse(await response.json());
    expect(body.bookings).toHaveLength(2);
    expect(body.bookings[0]).toMatchObject({
      startsAt: early,
      bookerName: 'Анна',
      eventType: { id: type.id, durationMinutes: 30 },
    });
    expect(body.bookings[0]!.comment).toBeUndefined();
    expect(body.bookings[1]).toMatchObject({
      startsAt: late,
      bookerName: 'Пётр',
      comment: 'Второй',
    });
  });

  it('upcoming=true — только предстоящие (конец ≥ сейчас); без параметра — все', async () => {
    const type = await seedEventTypeViaApi({ durationMinutes: 60 });

    // прошедшая бронь сеется напрямую: продакшн-путь такое не создаёт
    const db = await getDb();
    await db.booking.create({
      data: {
        eventTypeId: type.id,
        startsAt: new Date(Date.now() - 3 * 3600 * 1000),
        endsAt: new Date(Date.now() - 2 * 3600 * 1000),
        bookerName: 'Вчера',
        bookerContact: 'email:past@b.co',
      },
    });

    const upcoming = await postBooking({
      eventTypeId: type.id,
      startsAt: futureIso(24),
      bookerName: 'Завтра',
      bookerContact: 'email:tomorrow@b.co',
    });
    expect(upcoming.status).toBe(201);

    const filteredResponse = await getBookings('?upcoming=true');
    expect(filteredResponse.status).toBe(200);
    const filtered = schemas.BookingList.parse(await filteredResponse.json());
    expect(filtered.bookings.map((booking) => booking.bookerName)).toEqual(['Завтра']);
    expect(
      filtered.bookings.every((booking) => new Date(booking.endsAt).getTime() >= Date.now()),
    ).toBe(true);

    const all = schemas.BookingList.parse(await (await getBookings()).json());
    expect(all.bookings.map((booking) => booking.bookerName)).toEqual(['Вчера', 'Завтра']);
  });

  it('upcoming=false — все брони (как без параметра)', async () => {
    const type = await seedEventTypeViaApi();

    await postBooking({
      eventTypeId: type.id,
      startsAt: futureIso(24),
      bookerName: 'Анна',
      bookerContact: 'phone:+79160000000',
    });

    const response = await getBookings('?upcoming=false');
    const body = schemas.BookingList.parse(await response.json());
    expect(body.bookings).toHaveLength(1);
  });

  it('upcoming=yes → 422 VALIDATION_ERROR', async () => {
    const response = await getBookings('?upcoming=yes');

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('upcoming');
  });
});
