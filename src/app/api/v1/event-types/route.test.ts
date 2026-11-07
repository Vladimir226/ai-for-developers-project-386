import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  getEventTypes,
  postEventType,
  seedEventTypeViaApi,
  silenceRequestLogs,
} from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): Route Handler вызывается напрямую, как это
// делал бы любой HTTP-клиент. БД — свежая временная SQLite (NFR-003).
// Каждый ответ парсится сгенерированной из контракта Zod-схемой — конформанс
// TypeSpec-контракту v2 (#32, ADR-010) проверяется каждым тестом.

setupTestDatabase();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('GET /api/v1/event-types', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('без типов → 200 {"eventTypes":[]}', async () => {
    const response = await getEventTypes();

    expect(response.status).toBe(200);
    expect(schemas.EventTypeList.parse(await response.json())).toEqual({ eventTypes: [] });
  });

  it('возвращает созданные типы по возрастанию создания; description без значения опущено', async () => {
    await seedEventTypeViaApi({ title: 'Звонок', durationMinutes: 30 });
    await seedEventTypeViaApi({
      title: 'Стратегия',
      description: 'Разбор архитектуры',
      durationMinutes: 60,
    });

    const response = await getEventTypes();

    expect(response.status).toBe(200);

    const body = schemas.EventTypeList.parse(await response.json());
    expect(body.eventTypes).toHaveLength(2);
    expect(body.eventTypes[0]).toMatchObject({ title: 'Звонок', durationMinutes: 30 });
    expect(body.eventTypes[0]!.description).toBeUndefined();
    expect(body.eventTypes[1]).toMatchObject({
      title: 'Стратегия',
      description: 'Разбор архитектуры',
      durationMinutes: 60,
    });
  });
});

describe('POST /api/v1/event-types', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('создаёт тип: 201, тело — EventType по контракту', async () => {
    const response = await postEventType({
      title: 'Консультация',
      description: 'Созвон 45 минут',
      durationMinutes: 45,
    });

    expect(response.status).toBe(201);

    const body = schemas.EventTypeCreated.parse(await response.json());
    expect(body.id).toMatch(UUID_RE);
    expect(body).toMatchObject({
      title: 'Консультация',
      description: 'Созвон 45 минут',
      durationMinutes: 45,
    });
  });

  it('границы контракта (название 1..100, описание ≤500, длительность 15..180) → 422 с field/message', async () => {
    const response = await postEventType({
      title: '',
      description: 'x'.repeat(501),
      durationMinutes: 10,
    });

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const fields = body.error.details?.map((item) => item.field);
    expect(fields).toContain('title');
    expect(fields).toContain('description');
    expect(fields).toContain('durationMinutes');
  });

  it('битый JSON → 422 VALIDATION_ERROR', async () => {
    const response = await postEventType('{не-json');

    expect(response.status).toBe(422);

    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('body');
  });
});
