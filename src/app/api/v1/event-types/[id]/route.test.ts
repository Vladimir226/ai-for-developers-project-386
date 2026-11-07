import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import { getDb } from '@/lib/db/prisma';
import {
  deleteEventType,
  getEventTypes,
  postBooking,
  putEventType,
  seedEventTypeViaApi,
  silenceRequestLogs,
  futureIso,
} from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): PUT/DELETE типа события по контракту v2.
// DELETE — каскадный (D4): брони удаляются вместе с типом, время
// освобождается для остальных типов.

setupTestDatabase();

describe('PUT /api/v1/event-types/{id}', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('полная замена полей: 200 с обновлённым типом', async () => {
    const created = await seedEventTypeViaApi({ durationMinutes: 30 });

    const response = await putEventType(created.id, {
      title: 'Разбор оффера',
      durationMinutes: 60,
    });

    expect(response.status).toBe(200);

    const body = schemas.EventType.parse(await response.json());
    expect(body).toMatchObject({
      id: created.id,
      title: 'Разбор оффера',
      durationMinutes: 60,
    });
    expect(body.description).toBeUndefined();
  });

  it('неизвестный id → 404 NOT_FOUND', async () => {
    const response = await putEventType('00000000-0000-4000-8000-000000000000', {
      title: 'Разбор',
      durationMinutes: 30,
    });

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('невалидное тело → 422 VALIDATION_ERROR', async () => {
    const created = await seedEventTypeViaApi();

    const response = await putEventType(created.id, { title: 'Разбор', durationMinutes: 200 });

    expect(response.status).toBe(422);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/v1/event-types/{id}', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('удаляет тип: 204 без тела, повторно 404, списка тип больше не содержит', async () => {
    const created = await seedEventTypeViaApi();

    const response = await deleteEventType(created.id);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');

    expect((await deleteEventType(created.id)).status).toBe(404);
    const list = schemas.EventTypeList.parse(await (await getEventTypes()).json());
    expect(list.eventTypes).toHaveLength(0);
  });

  it('неизвестный id → 404 NOT_FOUND', async () => {
    const response = await deleteEventType('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('каскад D4: брони удаляются вместе с типом, время освобождается для остальных', async () => {
    const doomed = await seedEventTypeViaApi({ title: 'Исчезающий', durationMinutes: 60 });
    const staying = await seedEventTypeViaApi({ title: 'Остающийся', durationMinutes: 30 });
    const startsAt = futureIso(48);

    const booked = await postBooking({
      eventTypeId: doomed.id,
      startsAt,
      bookerName: 'Мария',
      bookerContact: 'telegram: @maria',
    });
    expect(booked.status).toBe(201);

    const response = await deleteEventType(doomed.id);
    expect(response.status).toBe(204);

    const db = await getDb();
    expect(await db.booking.count()).toBe(0);
    expect(await db.eventType.count()).toBe(1);

    // время освободилось: тот же интервал теперь бронируется другим типом
    const rebooked = await postBooking({
      eventTypeId: staying.id,
      startsAt,
      bookerName: 'Пётр',
      bookerContact: 'email:petr@b.co',
    });
    expect(rebooked.status).toBe(201);
  });
});
