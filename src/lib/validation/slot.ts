import { z } from 'zod';
import type { FieldIssue, ParseResult } from './zod-issues';

// Валидация параметров вычисляемых слотов (ADR-005, ADR-009, ADR-010):
// структура — сгенерированные из контракта схемы, здесь (допустимое
// дополнение по ADR-005) — доменные правила окна и нормализация в
// UTC-инстанты. Часть о публикации интервалов (parseCreateSlotBody)
// удалена вместе с POST /api/v1/slots (ADR-0011); валидация тела брони
// вернётся с реализацией сервера (#33).

export const DEFAULT_PERIOD_DAYS = 14;

/** Провалидированные параметры `GET /api/v1/event-types/{id}/slots` в UTC-инстантах. */
export interface SlotQuery {
  from: Date;
  to: Date;
}

// Тот же формат, что в сгенерированных схемах контракта: ISO 8601 только
// со смещением или Z (ADR-009). Нормализация в UTC — через Date-инстант.
const utcInstant = z.string().datetime({ offset: true });

const NOT_ISO = 'должно быть ISO 8601 с зоной (Z или смещение ±ЧЧ:ММ)';

function instant(field: string, raw: unknown, issues: FieldIssue[]): Date | undefined {
  const parsed = utcInstant.safeParse(raw);
  if (!parsed.success) {
    issues.push({ field, message: NOT_ISO });
    return undefined;
  }
  return new Date(parsed.data);
}

/**
 * Параметры `GET /api/v1/event-types/{id}/slots`: `from`/`to` опциональны
 * (дефолт `[now; now + 14 дней]` — окно записи, D6), `from` не позже `to`.
 */
export function parseSlotQuery(
  params: Record<string, string | undefined>,
  now: Date,
): ParseResult<SlotQuery> {
  const issues: FieldIssue[] = [];

  const from = params.from === undefined ? now : instant('from', params.from, issues);
  const to =
    params.to === undefined
      ? new Date(now.getTime() + DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      : instant('to', params.to, issues);

  if (from && to && from.getTime() > to.getTime()) {
    issues.push({ field: 'from', message: 'начало периода не может быть позже конца' });
  }

  if (issues.length > 0 || from === undefined || to === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, value: { from, to } };
}
