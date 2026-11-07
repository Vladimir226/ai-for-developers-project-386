import { describe, expect, it, vi } from 'vitest';

// Шов 1 (integration, ADR-004): вызов Route Handler напрямую — как это будет
// делать любой HTTP-клиент, но без поднятия сервера.
// GET /api/health — единственный инфраструктурный эндпоинт вне версионного
// префикса /api/v1 и вне TypeSpec-контракта (ADR-010).

describe('GET /api/health', () => {
  it('отвечает 200 {"status":"ok"}', async () => {
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost:3000/api/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('логирует один запрос одной JSON-строкой (NFR-006) и отдаёт x-request-id', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line) => lines.push(String(line)));

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost:3000/api/health'));

    log.mockRestore();

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({
      requestId,
      method: 'GET',
      path: '/api/health',
      status: 200,
    });
    expect(typeof entry.durationMs).toBe('number');
  });
});
