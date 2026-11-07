import { jsonError } from '@/lib/http/json-error';
import type { ParseResult } from '@/lib/validation/zod-issues';

// Разбор JSON-тела запроса (ADR-005): некорректный JSON → готовый ответ
// 422 VALIDATION_ERROR (не 400 из ADR-005): контракт описывает только 422 —
// компромисс, зафиксированный в PR #4; фактическая семантика закреплена
// аддендумом ADR-0005 от 2026-11-07 (все ошибки данных — единый 422).

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

/**
 * Разбор JSON-тела + валидация: общая связка POST/PUT Route Handlers —
 * битый JSON и ошибки полей отвечают одним конвертом 422 VALIDATION_ERROR
 * («Невалидное тело запроса» + details полей). `parse` — функция валидации
 * из lib/validation (сгенерированная схема + доменные надстройки).
 */
export async function parseBodyOr<T>(
  request: Request,
  parse: (body: unknown) => ParseResult<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  const parsed = parse(bodyResult.body);
  if (!parsed.ok) {
    return {
      ok: false,
      response: jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues),
    };
  }
  return { ok: true, value: parsed.value };
}
