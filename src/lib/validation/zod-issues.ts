import type { ZodIssue } from 'zod';

// Общие типы и конвертер валидации запросов (ADR-005): Zod-ошибки →
// элементы error.details конверта (field/message). Фолбэк для некритичных
// кодов задаёт вызывающий модуль: слоты — «не ISO 8601», брони —
// «некорректное значение».

/** Элемент `error.details` конверта ошибок для VALIDATION_ERROR (ADR-005). */
export interface FieldIssue {
  field: string;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

/** invalid_type → «обязательное поле», прочие коды → fallback. */
export function fromZodIssues(issues: ZodIssue[], fallback: string): FieldIssue[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'body',
    message: issue.code === 'invalid_type' ? 'обязательное поле' : fallback,
  }));
}
