import { logRequestLine } from '@/lib/logger';

// lib/http (architecture.md §4): helpers запросов/ответов — request-id и
// одна JSON-строка на каждый HTTP-запрос к API (NFR-006).
//
// Паттерн для всех Route Handlers: `export const GET = withRequestLogging(async (request) => ...)`.
// request-id приходит из middleware (src/middleware.ts) или генерируется
// здесь — прямой вызов handler'а в тестах обходит middleware.

type Handler = (request: Request) => Promise<Response>;

export function withRequestLogging(handler: Handler): Handler {
  return async (request) => {
    const startedAt = Date.now();
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

    const response = await handler(request);
    const enriched = new Response(response.body, response);
    enriched.headers.set('x-request-id', requestId);

    logRequestLine({
      time: new Date().toISOString(),
      level: 'info',
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: enriched.status,
      durationMs: Date.now() - startedAt,
    });

    return enriched;
  };
}
