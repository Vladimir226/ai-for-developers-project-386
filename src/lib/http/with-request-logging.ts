import { logRequestLine } from '@/lib/logger';

// lib/http (architecture.md §4): helpers запросов/ответов — request-id и
// одна JSON-строка на каждый HTTP-запрос к API (NFR-006).
//
// Паттерн для всех Route Handlers:
//   `export const GET = withRequestLogging(async (request) => ...)`.
// request-id приходит из middleware (src/middleware.ts); здесь — только
// fallback на случай прямого вызова handler'а (тесты шва 1).

type Handler = (request: Request) => Promise<Response>;

export function withRequestLogging(handler: Handler): Handler {
  return async (request) => {
    const startedAt = Date.now();
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const base = {
      time: new Date().toISOString(),
      level: 'info' as const,
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
    };

    try {
      const response = await handler(request);
      const enriched = new Response(response.body, response);
      enriched.headers.set('x-request-id', requestId);
      logRequestLine({ ...base, status: enriched.status, durationMs: Date.now() - startedAt });
      return enriched;
    } catch (error) {
      // Исключение пробрасываем: Next ответит 500. Но строка лога обязательна —
      // «каждый HTTP-запрос логируется», включая упавшие (NFR-006).
      logRequestLine({ ...base, status: 500, durationMs: Date.now() - startedAt });
      throw error;
    }
  };
}
