import { schemas } from '@/generated/zod';
import type { WorkingHoursDay } from '@/domain/availability/working-hours';
import { fromZodIssues, type FieldIssue, type ParseResult } from './zod-issues';

// Валидация тела рабочих часов (ADR-005, ADR-010): границы минут (0..1440),
// день недели (0..6) и типы полей — сгенерированная схема контракта.
// Доменные правила в контракте невыразимы — серверная надстройка здесь
// (допустимо по ADR-005): ровно 7 дней без дублей; рабочему дню нужны
// обе границы и startMinutes < endMinutes; выходному минуты не нужны.

const NOT_VALID = 'некорректное значение';

const SEVEN_DAYS = 'нужно ровно 7 дней — по одному на каждый день недели';
const NO_DUPLICATES = 'дни недели не должны повторяться';
const REQUIRED_FOR_WORKING = 'обязательное поле для рабочего дня';
const END_AFTER_START = 'конец должен быть позже начала (или сделайте день выходным)';

/**
 * Тело `PUT /api/v1/working-hours`: полная неделя. Возвращает
 * нормализованные дни — выходным обнуляются минуты (форма хранения).
 */
export function parseWorkingHoursBody(body: unknown): ParseResult<WorkingHoursDay[]> {
  const shape = schemas.WorkingHours.safeParse(body);
  if (!shape.success) {
    return { ok: false, issues: fromZodIssues(shape.error.issues, NOT_VALID) };
  }

  const days = shape.data.days;
  const issues: FieldIssue[] = [];

  if (days.length !== 7) {
    issues.push({ field: 'days', message: SEVEN_DAYS });
  }

  const seenWeekdays = new Set<number>();
  for (const day of days) {
    if (seenWeekdays.has(day.weekday)) {
      issues.push({ field: 'days', message: NO_DUPLICATES });
      break;
    }
    seenWeekdays.add(day.weekday);
  }

  days.forEach((day, index) => {
    if (day.isDayOff) return;

    if (day.startMinutes === undefined) {
      issues.push({ field: `days.${index}.startMinutes`, message: REQUIRED_FOR_WORKING });
    }
    if (day.endMinutes === undefined) {
      issues.push({ field: `days.${index}.endMinutes`, message: REQUIRED_FOR_WORKING });
    }
    if (day.startMinutes !== undefined && day.endMinutes !== undefined && day.startMinutes >= day.endMinutes) {
      issues.push({ field: `days.${index}.endMinutes`, message: END_AFTER_START });
    }
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: days.map((day) =>
      day.isDayOff
        ? { weekday: day.weekday, isDayOff: true, startMinutes: 0, endMinutes: 0 }
        : {
            weekday: day.weekday,
            isDayOff: false,
            startMinutes: day.startMinutes!,
            endMinutes: day.endMinutes!,
          },
    ),
  };
}
