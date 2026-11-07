import { jsonError } from '@/lib/http/json-error';

// Разбор JSON-тела запроса (ADR-005): некорректный JSON → готовый ответ
// 422 VALIDATION_ERROR (не 400 из ADR-005): контракт #12 описывает только
// 422 — компромисс, зафиксированный в PR #4.

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', [
        { field: 'body', message: 'ожидается корректный JSON' },
      ]),
    };
  }
}
