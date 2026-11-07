import { z } from 'zod';
import { schemas } from '@/generated/zod';
import type { Interval } from '@/domain/availability/intervals';
import { fromZodIssues, type FieldIssue, type ParseResult } from './zod-issues';

// Валидация запросов слотов (ADR-005, ADR-009, ADR-010). Источник структуры —
// сгенерированные из контракта Zod-схемы (`schemas.CreateSlotRequest`,
// `schemas.SlotView`); hand-written надстройка здесь (допустимое дополнение
// по ADR-005): доменные правила («в будущем», «конец позже начала», окно
// периода) и нормализация в UTC-инстанты. Тип интервала принадлежит домену.

export const DEFAULT_PERIOD_DAYS = 31;

/** Провалидированные параметры `GET /api/v1/slots` в UTC-инстантах. */
export interface SlotQuery {
  from: Date;
  to: Date;
  view: 'free' | 'all';
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
 * Тело `POST /api/v1/slots`: структура — по контракту; `startsAt` строго
 * в будущем относительно `now`, `endsAt` строго позже `startsAt`.
 */
export function parseCreateSlotBody(body: unknown, now: Date): ParseResult<Interval> {
  const shape = schemas.CreateSlotRequest.safeParse(body);
  if (!shape.success) {
    return { ok: false, issues: fromZodIssues(shape.error.issues, NOT_ISO) };
  }

  const issues: FieldIssue[] = [];
  const startsAt = new Date(shape.data.startsAt);
  const endsAt = new Date(shape.data.endsAt);

  if (startsAt.getTime() <= now.getTime()) {
    issues.push({ field: 'startsAt', message: 'начало должно быть в будущем' });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    issues.push({ field: 'endsAt', message: 'конец должен быть позже начала' });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { startsAt, endsAt } };
}

/**
 * Параметры `GET /api/v1/slots`: `from`/`to` опциональны (дефолт
 * `[now; now + 31 день]`), `view` — `free|all` (дефолт `free`).
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

  const view = params.view ?? 'free';
  if (!schemas.SlotView.safeParse(view).success) {
    issues.push({ field: 'view', message: 'должно быть free или all' });
  }

  if (from && to && from.getTime() > to.getTime()) {
    issues.push({ field: 'from', message: 'начало периода не может быть позже конца' });
  }

  if (issues.length > 0 || from === undefined || to === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, value: { from, to, view: schemas.SlotView.parse(view) } };
}
