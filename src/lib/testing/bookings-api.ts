import { schemas } from '@/generated/zod';
import { BASE, futureIso, postSlot } from './slots-api';

export { silenceRequestLogs } from './slots-api';

// Хелперы шва 1 (integration) для броней: вызовы Route Handlers так, как их
// делал бы любой HTTP-клиент, без поднятия сервера (ADR-004). Даты — от
// Date.now(): фиксированные календарные даты в тестах протухают.

/** Сеет свободный будущий слот через API и возвращает его по контракту. */
export async function seedSlotViaApi() {
  const response = await postSlot({ startsAt: futureIso(24), endsAt: futureIso(25) });
  if (response.status !== 201) {
    throw new Error(`сеяние слота упало: ${response.status}`);
  }
  return schemas.SlotCreated.parse(await response.json());
}

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

export function getBookings(): Promise<Response> {
  return import('@/app/api/v1/bookings/route').then(({ GET }) =>
    GET(new Request(`${BASE}/api/v1/bookings`)),
  );
}

export function deleteBooking(id: string): Promise<Response> {
  return import('@/app/api/v1/bookings/[id]/route').then(({ DELETE }) =>
    DELETE(new Request(`${BASE}/api/v1/bookings/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    }),
  );
}
