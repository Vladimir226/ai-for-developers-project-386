import { schemas } from '@/generated/zod';
import { fromZodIssues, type ParseResult } from './zod-issues';

// Валидация тела типов событий (ADR-005, ADR-010): структура и ограничения
// (название 1..100, описание ≤500, длительность 15..180) — сгенерированная
// из контракта схема EventTypeDraft, общая для POST и PUT.

export interface EventTypeDraftInput {
  title: string;
  description?: string;
  durationMinutes: number;
}

const NOT_VALID = 'некорректное значение';

/** Тело `POST/PUT /api/v1/event-types`: структура и границы — по контракту. */
export function parseEventTypeDraft(body: unknown): ParseResult<EventTypeDraftInput> {
  const parsed = schemas.EventTypeDraft.safeParse(body);
  if (!parsed.success) {
    return { ok: false, issues: fromZodIssues(parsed.error.issues, NOT_VALID) };
  }
  return { ok: true, value: parsed.data };
}
