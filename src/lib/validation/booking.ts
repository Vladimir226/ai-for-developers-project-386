import { schemas } from '@/generated/zod';
import { fromZodIssues, type ParseResult } from './zod-issues';

// Валидация запросов броней (ADR-005, ADR-010): структура и ограничения
// полей (длины 1..100 / 5..200 / ≤500, UUID типа, ISO-8601 со смещением) —
// сгенерированная из контракта схема CreateBookingRequest. Доменные правила
// («слот в прошлом», наложение интервалов — D12) — в доменном модуле
// bookings, не здесь. Query-параметры контрактом не типизируются —
// hand-written разбор `upcoming` (допустимо по ADR-005).

export interface CreateBookingInput {
  eventTypeId: string;
  startsAt: Date;
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
  return { ok: true, value: { ...parsed.data, startsAt: new Date(parsed.data.startsAt) } };
}

/** Параметр `?upcoming` из `GET /api/v1/bookings`: true/false или отсутствует. */
export function parseUpcomingParam(raw: string | undefined): ParseResult<boolean | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === 'true') return { ok: true, value: true };
  if (raw === 'false') return { ok: true, value: false };
  return { ok: false, issues: [{ field: 'upcoming', message: 'должно быть true или false' }] };
}
