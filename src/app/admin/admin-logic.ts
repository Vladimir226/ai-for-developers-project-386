// Чистая логика админ-страницы (ADR-004: UI тонкий, правил не содержит).
// Право veto остаётся за сервером: локальные проверки формы только объясняют
// пользователю состояние до отправки, а серверные 422 маппятся в те же ключи
// полей (ADR-005). Рабочие часы — «настенное» время APP_TZ (ADR-009), в контракт
// уходят минуты от полуночи (D3). Брони (#36): карточки предстоящих —
// фильтр «конец ≥ сейчас» делает сервер (?upcoming=true), диапазон
// форматируется здесь же на сервере в APP_TZ (ADR-0009).

import { formatInterval } from '@/lib/time/display';

/** Ошибки полей: ключи — имена полей формы (совпадают с полями конверта). */
export type FieldErrors = Record<string, string>;

/** Элемент `error.details` конверта для VALIDATION_ERROR (ADR-005). */
export interface FieldIssue {
  field: string;
  message: string;
}

// ── Длительность ─────────────────────────────────────────────────────────────

/** Русская плюрализация: 1 минута, 22 минуты, 17 минут. */
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Длительность типа в человекочитаемом виде: «30 минут», «1 час»,
 * «1 час 30 минут», «2 часа». Нулевые минуты опускаются (60 → «1 час»).
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${pluralRu(hours, 'час', 'часа', 'часов')}`);
  if (mins > 0) parts.push(`${mins} ${pluralRu(mins, 'минута', 'минуты', 'минут')}`);
  return parts.join(' ');
}

/** «1 тип», «2 типа», «5 типов» — счётчик заголовка списка. */
export function countEventTypes(n: number): string {
  return `${n} ${pluralRu(n, 'тип', 'типа', 'типов')}`;
}

/** Минуты от полуночи → «чч:мм» для инпутов времени: 540 → «09:00». */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * «чч:мм» → минуты от полуночи; мусор и время за пределами суток → null.
 * Граница UI — 23:59 (конец дня 24:00 достижим только через API).
 */
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// ── Форма типа события ───────────────────────────────────────────────────────

/** Поля формы — строки, как в инпутах. */
export interface EventTypeFormValues {
  title: string;
  description: string;
  durationMinutes: string;
}

/** Значения формы создания: дружелюбная длительность по умолчанию. */
export function emptyEventTypeForm(): EventTypeFormValues {
  return { title: '', description: '', durationMinutes: '30' };
}

/** Форма типа события → черновик контракта (Create/UpdateEventTypeRequest). */
export function eventTypeFormFromEventType(eventType: {
  title: string;
  description?: string;
  durationMinutes: number;
}): EventTypeFormValues {
  return {
    title: eventType.title,
    description: eventType.description ?? '',
    durationMinutes: String(eventType.durationMinutes),
  };
}

/** Тело для POST/PUT: пробелы обрезаются, пустое описание → undefined. */
export function eventTypeDraftFromForm(values: EventTypeFormValues): {
  title: string;
  description?: string;
  durationMinutes: number;
} {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    durationMinutes: Number(values.durationMinutes),
  };
}

/**
 * Локальная проверка формы (косметика, сервер — истина): название 1..100,
 * описание ≤500, длительность — целые 15..180 (D1). Ключи ошибок совпадают
 * с полями конверта, чтобы одно место отображения покрывало оба источника.
 */
export function validateEventTypeForm(values: EventTypeFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  if (title.length === 0) errors['title'] = 'укажите название';
  else if (title.length > 100) errors['title'] = 'не больше 100 символов';

  if (values.description.trim().length > 500) errors['description'] = 'не больше 500 символов';

  const raw = values.durationMinutes.trim();
  if (raw === '') errors['durationMinutes'] = 'укажите длительность';
  else if (!/^\d+$/.test(raw)) errors['durationMinutes'] = 'целое число минут';
  else {
    const minutes = Number(raw);
    if (minutes < 15 || minutes > 180) errors['durationMinutes'] = 'от 15 до 180 минут';
  }
  return errors;
}

// ── Рабочие часы недели (D3) ─────────────────────────────────────────────────

/** Одна строка формы: день недели 0..6 (как в контракте), время «чч:мм». */
export interface WorkingDayRow {
  weekday: number;
  isDayOff: boolean;
  start: string;
  end: string;
}

/** День недели в JSON-форме контракта (models.tsp WorkingHoursDay). */
export interface WorkingHoursDayJson {
  weekday: number;
  isDayOff: boolean;
  startMinutes?: number;
  endMinutes?: number;
}

/** Порядок строк формы: Пн..Вс; 0 — воскресенье (как `Date#getDay`). */
export const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Короткие имена дней для строк формы. */
export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

/** Дефолт одного дня D3: рабочий 09:00–18:00. */
const DEFAULT_WORKING_ROW: Omit<WorkingDayRow, 'weekday'> = {
  isDayOff: false,
  start: '09:00',
  end: '18:00',
};

/** Латентное время выходного: включить день одним чекбоксом. */
const DEFAULT_DAY_OFF_ROW: Omit<WorkingDayRow, 'weekday'> = {
  isDayOff: true,
  start: '09:00',
  end: '18:00',
};

const D3_DEFAULT_DAYS: readonly WorkingHoursDayJson[] = [
  { weekday: 0, isDayOff: true },
  { weekday: 1, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 2, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 3, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 4, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 5, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 6, isDayOff: true },
];

/**
 * Дни из GET → строки формы Пн..Вс. `null` (не удалось прочитать) — дефолт
 * D3: Пн–Пт 09:00–18:00, Сб–Вс выходные; у выходного минуты не приходят,
 * строке остаются латентные 09:00–18:00.
 */
export function weekRowsFromDays(days: readonly WorkingHoursDayJson[] | null): WorkingDayRow[] {
  const byWeekday = new Map((days ?? D3_DEFAULT_DAYS).map((day) => [day.weekday, day]));
  return WEEK_DISPLAY_ORDER.map((weekday) => {
    const day = byWeekday.get(weekday);
    const base = day?.isDayOff ? DEFAULT_DAY_OFF_ROW : DEFAULT_WORKING_ROW;
    if (!day || day.isDayOff) return { weekday, ...base };
    return {
      weekday,
      isDayOff: false,
      start: minutesToHHMM(day.startMinutes ?? 9 * 60),
      end: minutesToHHMM(day.endMinutes ?? 18 * 60),
    };
  });
}

/**
 * Локальная проверка недели (косметика, сервер — истина): у рабочего дня оба
 * времени валидны и начало раньше конца. Ключи — как у серверных issues
 * (`days.<weekday>.startMinutes`), индекс отправляемого массива равен weekday,
 * потому что buildWorkingHoursBody сортирует.
 */
export function validateWeekRows(rows: readonly WorkingDayRow[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const row of rows) {
    if (row.isDayOff) continue;
    const start = hhmmToMinutes(row.start);
    const end = hhmmToMinutes(row.end);
    if (start === null) errors[`days.${row.weekday}.startMinutes`] = 'укажите время';
    if (end === null) errors[`days.${row.weekday}.endMinutes`] = 'укажите время';
    if (start !== null && end !== null && start >= end) {
      errors[`days.${row.weekday}.endMinutes`] =
        'конец должен быть позже начала (или сделайте день выходным)';
    }
  }
  return errors;
}

/**
 * Тело PUT недели из строк формы: дни сортируются по weekday 0..6 (индекс
 * массива = weekday — на этом держится маппинг серверных issues в строки),
 * у выходного минуты не отправляются (models.tsp). Времена обязаны быть
 * валидны — вызов после validateWeekRows без ошибок.
 */
export function buildWorkingHoursBody(rows: readonly WorkingDayRow[]): {
  days: WorkingHoursDayJson[];
} {
  const days = [...rows]
    .sort((a, b) => a.weekday - b.weekday)
    .map((row) => {
      if (row.isDayOff) return { weekday: row.weekday, isDayOff: true };
      const startMinutes = hhmmToMinutes(row.start);
      const endMinutes = hhmmToMinutes(row.end);
      if (startMinutes === null || endMinutes === null) {
        throw new Error(`невалидное время дня ${row.weekday}: сначала validateWeekRows`);
      }
      return { weekday: row.weekday, isDayOff: false, startMinutes, endMinutes };
    });
  return { days };
}

// ── Конверт ошибок API (ADR-005) ─────────────────────────────────────────────

/** Интерпретация неудачной мутации: только по error.code, без HTTP-деталей. */
export type MutationFailure =
  | { kind: 'invalid'; issues: FieldIssue[]; message?: string }
  | { kind: 'notFound'; message: string }
  | { kind: 'unknown' };

interface ErrorEnvelopeLike {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

/**
 * Разбор конверта ошибок (ADR-005): клиент интерпретирует ответ только по
 * машинному коду. Сетевые сбои (исключение fetch) сюда не попадают — их
 * ловит компонент.
 */
export function failureFromApiError(error: unknown): MutationFailure {
  const body = (error as ErrorEnvelopeLike | null)?.error;
  if (!body || typeof body !== 'object' || typeof body.code !== 'string') {
    return { kind: 'unknown' };
  }

  if (body.code === 'VALIDATION_ERROR') {
    const issues = Array.isArray(body.details)
      ? body.details
          .map((d): FieldIssue | null => {
            if (!d || typeof d !== 'object') return null;
            const field = (d as { field?: unknown }).field;
            const message = (d as { message?: unknown }).message;
            if (typeof field !== 'string' || typeof message !== 'string') return null;
            return { field, message };
          })
          .filter((d): d is FieldIssue => d !== null)
      : [];
    if (issues.length > 0) return { kind: 'invalid', issues };
    if (typeof body.message === 'string' && body.message.length > 0) {
      return { kind: 'invalid', issues: [], message: body.message };
    }
    return { kind: 'invalid', issues: [] };
  }

  if (body.code === 'NOT_FOUND') {
    return {
      kind: 'notFound',
      message: typeof body.message === 'string' ? body.message : 'не найдено',
    };
  }

  return { kind: 'unknown' };
}

/**
 * Разделение серверных issues: известные поля формы — в fieldErrors (первое
 * сообщение побеждает), прочее (например, `days`) — в общие сообщения баннера.
 */
export function splitIssues(
  issues: readonly FieldIssue[],
  knownFields: readonly string[],
): { fieldErrors: FieldErrors; otherMessages: string[] } {
  const known = new Set(knownFields);
  const fieldErrors: FieldErrors = {};
  const otherMessages: string[] = [];
  for (const issue of issues) {
    if (known.has(issue.field) && !(issue.field in fieldErrors)) {
      fieldErrors[issue.field] = issue.message;
    } else if (!known.has(issue.field)) {
      otherMessages.push(issue.message);
    }
  }
  return { fieldErrors, otherMessages };
}

// ── Брони: список предстоящих (#36) ──────────────────────────────────────────

/** Бронь в JSON-форме контракта (GET /api/v1/bookings, models.tsp Booking). */
export interface BookingJson {
  id: string;
  eventType: { id: string; title: string; durationMinutes: number };
  startsAt: string;
  endsAt: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
  createdAt: string;
}

/**
 * Параметры GET для секции «Брони»: только предстоящие (конец ≥ сейчас).
 * Фильтр — серверный; UI повторно не фильтрует (ADR-004: сервер — истина).
 */
export const UPCOMING_BOOKINGS_QUERY = { query: { upcoming: true } } as const;

/** Карточка брони: всё готово к рендеру, клиентский компонент не вычисляет. */
export interface BookingCardData {
  id: string;
  eventTypeTitle: string;
  durationLabel: string;
  when: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
}

/**
 * Бронь → карточка секции «Брони»: тип встречи, длительность («30 минут»)
 * и диапазон «вт, 10 ноября · 10:00–10:30» в зоне APP_TZ — форматирование
 * только на сервере (ADR-0009), клиент зоны не преобразует.
 */
export function bookingCardFromBooking(booking: BookingJson, timeZone: string): BookingCardData {
  const card: BookingCardData = {
    id: booking.id,
    eventTypeTitle: booking.eventType.title,
    durationLabel: formatDuration(booking.eventType.durationMinutes),
    when: formatInterval(booking.startsAt, booking.endsAt, timeZone),
    bookerName: booking.bookerName,
    bookerContact: booking.bookerContact,
  };
  if (booking.comment !== undefined) card.comment = booking.comment;
  return card;
}

/**
 * Итог неудачной отмены для карточки: null — молча (404: бронь уже исчезла,
 * например отменена в другом окне, — карточку уберёт router.refresh),
 * строка — общее сообщение. 422/409 для DELETE не ожидаемы по контракту,
 * но любой конверт разбирается без падения (failureFromApiError, ADR-0005).
 */
export function cancelFailureNotice(failure: MutationFailure): string | null {
  if (failure.kind === 'notFound') return null;
  return 'не удалось отменить бронь — попробуйте ещё раз';
}
