import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import { getDb } from '@/lib/db/prisma';
import { getWorkingHours, putWorkingHours, silenceRequestLogs, weekHours } from '@/lib/testing/api';
import { clearTables, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): GET/PUT рабочих часов по контракту v2.
// Дефолт D3 живёт в памяти: пустая таблица после деструктивной миграции
// (D5) не сеет строки — GET отвечает дефолтом, ничего не записывая.

setupTestDatabase();

describe('GET /api/v1/working-hours', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('пустая таблица → дефолт D3: Пн–Пт 09:00–18:00, Сб–Вс выходные; без записи в БД', async () => {
    const response = await getWorkingHours();

    expect(response.status).toBe(200);

    const body = schemas.WorkingHours.parse(await response.json());
    expect(body.days).toHaveLength(7);

    const byWeekday = new Map(body.days.map((day) => [day.weekday, day]));
    expect([...byWeekday.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(byWeekday.get(0)).toEqual({ weekday: 0, isDayOff: true });
    expect(byWeekday.get(6)).toEqual({ weekday: 6, isDayOff: true });
    for (const weekday of [1, 2, 3, 4, 5]) {
      expect(byWeekday.get(weekday)).toEqual({
        weekday,
        isDayOff: false,
        startMinutes: 9 * 60,
        endMinutes: 18 * 60,
      });
    }

    const db = await getDb();
    expect(await db.workingHours.count()).toBe(0);
  });
});

describe('PUT /api/v1/working-hours', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearTables();
  });

  it('записывает полную неделю: 200 с эхом, GET отдаёт сохранённое', async () => {
    const days = weekHours({ startMinutes: 10 * 60, endMinutes: 16 * 60 }, [0, 3, 6]);

    const response = await putWorkingHours({ days });

    expect(response.status).toBe(200);
    expect(schemas.WorkingHours.parse(await response.json())).toEqual({ days });

    const stored = schemas.WorkingHours.parse(await (await getWorkingHours()).json());
    expect(stored.days).toHaveLength(7);
    const wednesday = stored.days.find((day) => day.weekday === 3);
    expect(wednesday).toEqual({ weekday: 3, isDayOff: true });
    const monday = stored.days.find((day) => day.weekday === 1);
    expect(monday).toEqual({
      weekday: 1,
      isDayOff: false,
      startMinutes: 600,
      endMinutes: 960,
    });
  });

  it('шесть дней → 422 VALIDATION_ERROR по полю days', async () => {
    const days = weekHours({ startMinutes: 540, endMinutes: 1080 }).slice(0, 6);

    const response = await putWorkingHours({ days });

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('days');
  });

  it('дубль дня недели → 422 VALIDATION_ERROR', async () => {
    const days = weekHours({ startMinutes: 540, endMinutes: 1080 });
    days[4] = { weekday: 3, isDayOff: false, startMinutes: 540, endMinutes: 1080 };

    const response = await putWorkingHours({ days });

    expect(response.status).toBe(422);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('рабочий день со startMinutes ≥ endMinutes → 422 с полем дня', async () => {
    const days = weekHours({ startMinutes: 540, endMinutes: 1080 });
    days[2] = { weekday: 2, isDayOff: false, startMinutes: 700, endMinutes: 700 };

    const response = await putWorkingHours({ days });

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.[0]?.field).toBe('days.2.endMinutes');
  });

  it('рабочему дню не заданы минуты → 422 (выходному минуты не нужны)', async () => {
    const days = weekHours({ startMinutes: 540, endMinutes: 1080 });
    days[5] = { weekday: 5, isDayOff: false };
    days[6] = { weekday: 6, isDayOff: true, startMinutes: 100 };

    const response = await putWorkingHours({ days });

    expect(response.status).toBe(422);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    const fields = body.error.details?.map((item) => item.field);
    expect(fields).toContain('days.5.startMinutes');
    expect(fields).toContain('days.5.endMinutes');
  });

  it('границы контракта (день недели 0..6, минуты 0..1440) → 422', async () => {
    const badWeekday = weekHours({ startMinutes: 540, endMinutes: 1080 });
    badWeekday[1] = { weekday: 7, isDayOff: false, startMinutes: 540, endMinutes: 1080 };

    const badMinutes = weekHours({ startMinutes: 540, endMinutes: 1080 });
    badMinutes[1] = { weekday: 1, isDayOff: false, startMinutes: -1, endMinutes: 1080 };

    for (const days of [badWeekday, badMinutes]) {
      const response = await putWorkingHours({ days });
      expect(response.status).toBe(422);
      expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }
  });

  it('битый JSON → 422 VALIDATION_ERROR', async () => {
    const response = await putWorkingHours('не json');

    expect(response.status).toBe(422);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
