import { vi } from 'vitest';
import type { z } from 'zod';
import { schemas } from '@/generated/zod';

// Хелперы шва 1 (integration): вызовы Route Handlers новой модели
// (ADR-0011, контракт v2) так, как их делал бы любой HTTP-клиент, без
// поднятия сервера (ADR-004). Все даты вычисляются от Date.now() —
// фиксированные календарные даты в тестах «начало в будущем» протухают.

const BASE = 'http://localhost:3000';

/** Зона стены тестов — дефолт APP_TZ (ADR-009), как в прод-контейнере. */
const TZ = 'Europe/Moscow';

export { BASE };

/** Глушит JSON-строки запросов (NFR-006) — в тестах они не нужны. */
export function silenceRequestLogs(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
}

/** ISO-строка через hoursFromNow часов, с точностью до секунды. */
export function futureIso(hoursFromNow: number): string {
  return startOfSecond(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

/** ISO-строка hoursAgo часов назад, с точностью до секунды. */
export function pastIso(hoursAgo: number): string {
  return startOfSecond(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

/**
 * Мгновение, обрезанное до секунды. Round-trip DateTime через движок Prisma
 * даёт дрожание до 1 мс, поэтому тесты сравнивают только секундные метки.
 */
export function startOfSecond(timestamp: number): Date {
  return new Date(Math.floor(timestamp / 1000) * 1000);
}

function wallParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Полночь стены ближайшего будущего дня недели `weekday` (0 — воскресенье …
 * 6 — суббота) не раньше чем через minHoursAhead часов, плюс addMinutes
 * минут. Europe/Moscow — фиксированное смещение без DST (ADR-009).
 */
export function futureWallTime(weekday: number, minHoursAhead: number, addMinutes = 0): Date {
  const min = new Date(Date.now() + minHoursAhead * 60 * 60 * 1000);
  const { year, month, day } = wallParts(min);
  for (let add = 0; ; add += 1) {
    const midnightUtcMs = Date.UTC(year, month - 1, day + add);
    if (new Date(midnightUtcMs).getUTCDay() === weekday) {
      return new Date(midnightUtcMs - 3 * 60 * 60 * 1000 + addMinutes * 60 * 1000);
    }
  }
}

/**
 * Полночь стены ближайшего понедельника не раньше чем через minHoursAhead
 * часов: первый рабочий слот этого дня гарантированно в будущем (дефолт
 * рабочих часов начинается в 09:00, D3).
 */
export function futureMondayMidnight(minHoursAhead = 72): Date {
  return futureWallTime(1, minHoursAhead);
}

/**
 * Валидный старт слота по дефолту часов D3: понедельник 09:00 стены MSK
 * (старт сетки любого типа — на сетке по построению), гарантированно в
 * будущем и внутри окна записи (окончание ≤ now + 10 дней < 14, D6).
 */
export function futureWorkingSlotStart(minHoursAhead = 72): Date {
  return futureWallTime(1, minHoursAhead, 9 * 60);
}

// ── Типы событий ────────────────────────────────────────────────────────────

export function getEventTypes(): Promise<Response> {
  return import('@/app/api/v1/event-types/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/event-types`)),
  );
}

export function postEventType(body: unknown): Promise<Response> {
  return import('@/app/api/v1/event-types/route').then(({ POST }) =>
    POST(
      new Request(`${BASE}/api/v1/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    ),
  );
}

export function putEventType(id: string, body: unknown): Promise<Response> {
  return import('@/app/api/v1/event-types/[id]/route').then(({ PUT }) =>
    PUT(
      new Request(`${BASE}/api/v1/event-types/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    ),
  );
}

export function deleteEventType(id: string): Promise<Response> {
  return import('@/app/api/v1/event-types/[id]/route').then(({ DELETE }) =>
    DELETE(new Request(`${BASE}/api/v1/event-types/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    }),
  );
}

/** Создаёт валидный тип через API и возвращает его по контракту. */
export async function seedEventTypeViaApi(
  overrides: { title?: string; description?: string; durationMinutes?: number } = {},
): Promise<z.infer<typeof schemas.EventType>> {
  const response = await postEventType({
    title: overrides.title ?? 'Консультация',
    ...(overrides.description !== undefined ? { description: overrides.description } : {}),
    durationMinutes: overrides.durationMinutes ?? 30,
  });
  if (response.status !== 201) {
    throw new Error(`сеяние типа события упало: ${response.status}`);
  }
  return schemas.EventType.parse(await response.json());
}

// ── Вычисляемые слоты ────────────────────────────────────────────────────────

export function getEventTypeSlots(id: string, query = ''): Promise<Response> {
  return import('@/app/api/v1/event-types/[id]/slots/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/event-types/${id}/slots${query}`), {
      params: Promise.resolve({ id }),
    }),
  );
}

// ── Рабочие часы ─────────────────────────────────────────────────────────────

export function getWorkingHours(): Promise<Response> {
  return import('@/app/api/v1/working-hours/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/working-hours`)),
  );
}

export function putWorkingHours(body: unknown): Promise<Response> {
  return import('@/app/api/v1/working-hours/route').then(({ PUT }) =>
    PUT(
      new Request(`${BASE}/api/v1/working-hours`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    ),
  );
}

/** Полная неделя: рабочий день day, кроме выходных weekdaysOff. */
export function weekHours(
  day: { startMinutes: number; endMinutes: number },
  weekdaysOff: number[] = [0, 6],
): unknown[] {
  return Array.from({ length: 7 }, (_, weekday) =>
    weekdaysOff.includes(weekday)
      ? { weekday, isDayOff: true }
      : { weekday, isDayOff: false, ...day },
  );
}

// ── Брони ────────────────────────────────────────────────────────────────────

export function postBooking(body: unknown): Promise<Response> {
  return import('@/app/api/v1/bookings/route').then(({ POST }) =>
    POST(
      new Request(`${BASE}/api/v1/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    ),
  );
}

export function getBookings(query = ''): Promise<Response> {
  return import('@/app/api/v1/bookings/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/bookings${query}`)),
  );
}

export function deleteBooking(id: string): Promise<Response> {
  return import('@/app/api/v1/bookings/[id]/route').then(({ DELETE }) =>
    DELETE(new Request(`${BASE}/api/v1/bookings/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    }),
  );
}
