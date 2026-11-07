import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';

// Шов 3 (unit, ADR-004/ADR-010): SDK-клиент, собранный из сгенерированных
// типов контракта. Проверяет связку «TypeSpec → openapi.yaml → типы →
// openapi-fetch»: типизированный вызов существующего пути с query-параметрами
// (если пути или типы разойдутся с контрактом — не скомпилируется).

describe('createApiClient (SDK из контракта)', () => {
  it('делает типизированный GET /api/v1/event-types', async () => {
    const eventTypesPayload = {
      eventTypes: [
        {
          id: '0ea3a3f5-6d21-4e5a-8f3e-91d3b1a4c22e',
          title: 'Консультация',
          durationMinutes: 30,
        },
      ],
    };
    const fetchMock = vi.fn(
      async (_request: Request) =>
        new Response(JSON.stringify(eventTypesPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const client = createApiClient({
      baseUrl: 'http://sdk-test.local',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { data, error, response } = await client.GET('/api/v1/event-types');

    expect(error).toBeUndefined();
    expect(response.status).toBe(200);
    expect(data).toEqual(eventTypesPayload);

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request.url).toBe('http://sdk-test.local/api/v1/event-types');
  });

  it('делает типизированный GET /api/v1/bookings?upcoming=true (резерв #36)', async () => {
    const bookingsPayload = { bookings: [] };
    const fetchMock = vi.fn(
      async (_request: Request) =>
        new Response(JSON.stringify(bookingsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const client = createApiClient({
      baseUrl: 'http://sdk-test.local',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { data } = await client.GET('/api/v1/bookings', {
      params: { query: { upcoming: true } },
    });

    expect(data).toEqual(bookingsPayload);
    const request = fetchMock.mock.calls[0]?.[0];
    expect(request.url).toBe('http://sdk-test.local/api/v1/bookings?upcoming=true');
  });
});
