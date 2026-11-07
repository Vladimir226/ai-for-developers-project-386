import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import { getDb } from '@/lib/db/prisma';
import {
  futureIso,
  getSlots,
  pastIso,
  postSlot,
  silenceRequestLogs,
  startOfSecond,
  withOffset,
} from '@/lib/testing/slots-api';
import { clearSlots, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): Route Handler вызывается напрямую, как это
// делал бы любой HTTP-клиент. БД — свежая временная SQLite (NFR-003).
// Каждый ответ парсится сгенерированной из контракта Zod-схемой — конформанс
// TypeSpec-контракту (#12, ADR-010) проверяется каждым тестом.
// Все даты вычисляются от Date.now(): фиксированные календарные даты
// в тестах «начало в будущем» протухают.

setupTestDatabase();

describe('POST /api/v1/slots', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('создаёт слот: 201, тело — слот по контракту, смещение нормализуется в Z', async () => {
    const startsAt = startOfSecond(Date.now() + 24 * 60 * 60 * 1000);
    const endsAt = startOfSecond(Date.now() + 25 * 60 * 60 * 1000);

    const response = await postSlot({
      startsAt: withOffset(startsAt, 3), // то же мгновение, записанное как +03:00
      endsAt: withOffset(endsAt, 3),
    });

    expect(response.status).toBe(201);

    const body = schemas.SlotCreated.parse(await response.json());
    // нормализация в UTC (ADR-009): смещение во входе → Z в ответе
    expect(body.startsAt).toBe(startsAt.toISOString());
    expect(body.endsAt).toBe(endsAt.toISOString());
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('невалидное тело → 422 VALIDATION_ERROR с details полей', async () => {
    const response = await postSlot({ startsAt: 'завтра', endsAt: 123 });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toEqual(expect.any(String));
    const fields = body.error.details?.map((item) => item.field);
    expect(fields).toContain('startsAt');
    expect(fields).toContain('endsAt');
  });

  it('некорректный JSON → 422 VALIDATION_ERROR', async () => {
    const response = await postSlot('не json');

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('body');
  });

  it('конец раньше начала → 422 с полем endsAt', async () => {
    const response = await postSlot({ startsAt: futureIso(48), endsAt: futureIso(47) });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'endsAt',
          message: expect.stringContaining('позже начала'),
        }),
      ]),
    );
  });

  it('начало в прошлом → 422 с полем startsAt', async () => {
    const response = await postSlot({ startsAt: pastIso(24), endsAt: futureIso(24) });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'startsAt',
          message: expect.stringContaining('будущем'),
        }),
      ]),
    );
  });

  it('пересечение с существующим слотом → 409 SLOT_OVERLAP', async () => {
    const created = await postSlot({ startsAt: futureIso(48), endsAt: futureIso(49) });
    expect(created.status).toBe(201);

    const response = await postSlot({ startsAt: futureIso(48.5), endsAt: futureIso(49.5) });

    expect(response.status).toBe(409);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('SLOT_OVERLAP');
    expect(body.error.message).toEqual(expect.any(String));
  });

  it('интервал, содержащийся внутри существующего, тоже пересечение → 409', async () => {
    const created = await postSlot({ startsAt: futureIso(48), endsAt: futureIso(50) });
    expect(created.status).toBe(201);

    const response = await postSlot({ startsAt: futureIso(48.5), endsAt: futureIso(49.5) });

    expect(response.status).toBe(409);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('SLOT_OVERLAP');
  });

  it('вплотную соседний интервал (конец == начало) допустим → 201', async () => {
    const boundary = futureIso(48);
    const first = await postSlot({ startsAt: futureIso(47), endsAt: boundary });
    expect(first.status).toBe(201);

    const second = await postSlot({ startsAt: boundary, endsAt: futureIso(49) });

    expect(second.status).toBe(201);
    expect(schemas.SlotCreated.parse(await second.json()).startsAt).toBe(
      new Date(boundary).toISOString(),
    );
  });

  it('параллельная публикация пересекающихся интервалов: ровно один 201, другой 409', async () => {
    const [first, second] = await Promise.all([
      postSlot({ startsAt: futureIso(48), endsAt: futureIso(50) }),
      postSlot({ startsAt: futureIso(49), endsAt: futureIso(51) }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });
});

describe('GET /api/v1/slots', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  /** Сеяние прошедшего слота напрямую в БД: POST прошедшие не создаёт. */
  async function seedPastSlot(): Promise<void> {
    const db = await getDb();
    await db.slot.create({
      data: { startsAt: new Date(pastIso(48)), endsAt: new Date(pastIso(47)) },
    });
  }

  it('без параметров: только будущие слоты дефолтного окна, по возрастанию начала', async () => {
    await seedPastSlot();
    const laterStartsAt = futureIso(48);
    const earlierStartsAt = futureIso(24);
    const later = await postSlot({ startsAt: laterStartsAt, endsAt: futureIso(49) });
    expect(later.status).toBe(201);
    const earlier = await postSlot({ startsAt: earlierStartsAt, endsAt: futureIso(25) });
    expect(earlier.status).toBe(201);

    const response = await getSlots();

    expect(response.status).toBe(200);
    const body = schemas.SlotList.parse(await response.json());
    expect(body.slots.map((slot) => slot.startsAt)).toEqual([
      new Date(earlierStartsAt).toISOString(), // по возрастанию, не в порядке создания
      new Date(laterStartsAt).toISOString(), // прошедший слот не попал
    ]);
  });

  it('view=all с явным окном возвращает и прошедшие интервалы', async () => {
    await seedPastSlot();

    const response = await getSlots(
      `?view=all&from=${encodeURIComponent(pastIso(72))}&to=${encodeURIComponent(futureIso(72))}`,
    );

    expect(response.status).toBe(200);
    const body = schemas.SlotList.parse(await response.json());
    expect(body.slots.map((slot) => slot.startsAt)).toEqual([new Date(pastIso(48)).toISOString()]);
  });

  it('from/to ограничивают окно: слот вне окна не возвращается', async () => {
    const created = await postSlot({ startsAt: futureIso(24), endsAt: futureIso(25) });
    expect(created.status).toBe(201);

    const later = await getSlots(
      `?from=${encodeURIComponent(futureIso(48))}&to=${encodeURIComponent(futureIso(72))}`,
    );

    expect(later.status).toBe(200);
    expect(schemas.SlotList.parse(await later.json()).slots).toEqual([]);
  });

  it('граница from включительно: слот, начинающийся ровно с from, возвращается', async () => {
    const startsAt = futureIso(24);
    const created = await postSlot({ startsAt, endsAt: futureIso(25) });
    expect(created.status).toBe(201);

    const response = await getSlots(
      `?from=${encodeURIComponent(startsAt)}&to=${encodeURIComponent(futureIso(72))}`,
    );

    const body = schemas.SlotList.parse(await response.json());
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0]?.startsAt).toBe(new Date(startsAt).toISOString());
  });

  it('невалидный from → 422 VALIDATION_ERROR', async () => {
    const response = await getSlots('?from=завтра');

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('from');
  });

  it('невалидный view → 422 VALIDATION_ERROR', async () => {
    const response = await getSlots('?view=everything');

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('view');
  });
});
