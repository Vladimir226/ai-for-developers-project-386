import { schemas } from '@/generated/zod';
import { fromZodIssues, type ParseResult } from './zod-issues';

// Валидация запросов броней (ADR-005, ADR-010): структура и ограничения
// полей (длины 1..100 / 5..200 / ≤500) — сгенерированная из контракта схема
// CreateBookingRequest. Доменные правила («слот в прошлом», занятость) — в
// доменном модуле bookings, не здесь.

export interface CreateBookingInput {
  slotId: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
}

const NOT_VALID = 'некорректное значение';

/** Тело `POST /api/v1/bookings`: структура и длины — по контракту. */
export function parseCreateBookingBody(body: unknown): ParseResult<CreateBookingInput> {
  const parsed = schemas.CreateBookingRequest.safeParse(body);
  if (!parsed.success) {
    return { ok: false, issues: fromZodIssues(parsed.error.issues, NOT_VALID) };
  }
  return { ok: true, value: parsed.data };
}
