import { vi } from 'vitest';
import { schemas } from '@/generated/zod';

// Хелперы шва 1 (integration): вызовы Route Handlers слотов так, как их
// делал бы любой HTTP-клиент, без поднятия сервера (ADR-004). Даты всегда
// вычисляются от Date.now() — фиксированные календарные даты в тестах
// «начало в будущем» протухают.

const BASE = 'http://localhost:3000';

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

/** То же мгновение, записанное со смещением ±ЧЧ:ММ (для проверки нормализации). */
export function withOffset(date: Date, hours: number): string {
  // стенные часы зоны +hours показывают большее время; метка смещения
  // возвращает его обратно к исходному мгновению при разборе
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', `+0${hours}:00`);
}

export function postSlot(body: unknown): Promise<Response> {
  return import('@/app/api/v1/slots/route').then(({ POST }) =>
    POST(
      new Request(`${BASE}/api/v1/slots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    ),
  );
}

export function getSlots(query = ''): Promise<Response> {
  return import('@/app/api/v1/slots/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/slots${query}`)),
  );
}

export function deleteSlot(id: string): Promise<Response> {
  return import('@/app/api/v1/slots/[id]/route').then(({ DELETE }) =>
    DELETE(new Request(`${BASE}/api/v1/slots/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    }),
  );
}

/** Создаёт валидный слот через API и возвращает его id. */
export async function createSlotViaApi(): Promise<string> {
  const response = await postSlot({ startsAt: futureIso(24), endsAt: futureIso(25) });
  if (response.status !== 201) {
    throw new Error(`сеяние слота упало: ${response.status}`);
  }
  return schemas.SlotCreated.parse(await response.json()).id;
}
