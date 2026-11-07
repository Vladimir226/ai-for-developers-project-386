import { formatTimeRange } from '@/lib/time/display';

// Чистая логика публичной страницы бронирования (ADR-004: UI тонкий, правил
// не содержит). Всё, что здесь есть, — подача уже состоявшегося ответа API:
// свободные слоты (view=free) группируются по настенным дням APP_TZ (ADR-009),
// календарь повторяет сетку макета index.html (#13), ошибки брони разбираются
// только по error.code (ADR-005). Форматирование — на сервере: клиент получает
// готовые подписи и не делает таймзонных преобразований.

/** Дефолтное окно GET /api/v1/slots — сейчас + 31 день (контракт, main.tsp). */
const BOOKING_WINDOW_DAYS = 31;

export interface CalendarSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  /** «10:30–11:00» в APP_TZ; через полночь — с датами (lib/time/display). */
  timeLabel: string;
}

/** День с свободными окнами; ключи и подписи — настенные, в APP_TZ. */
export interface CalendarDay {
  /** «2026-11-10» — настенная дата APP_TZ. */
  dateKey: string;
  /** «вторник, 10 ноября» — заголовок карточки дня и подписи успеха. */
  title: string;
  slots: CalendarSlot[];
}

/** Клетка сетки месяца: off — чужой месяц/вне окна, zero — без окон, open — есть окна. */
export type CalendarCellState = 'off' | 'zero' | 'open';

export interface CalendarCell {
  dateKey: string;
  dayNumber: number;
  state: CalendarCellState;
  isToday: boolean;
  count: number;
  /** aria-подпись «вторник, 10 ноября, свободных окон: 2»; для off — пустая. */
  label: string;
}

export interface CalendarMonth {
  /** «2026-11». */
  key: string;
  /** «ноябрь 2026» — именительный падеж. */
  label: string;
  /** 42 клетки, неделя с понедельника (макет #13). */
  cells: CalendarCell[];
}

export interface BookingCalendar {
  todayKey: string;
  windowEndKey: string;
  months: CalendarMonth[];
  days: Record<string, CalendarDay>;
}

/** Настенная дата инстанта в зоне — «2026-11-10». */
function wallDateKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Ключ даты из UTC-компонентов; календарная арифметика — без зон. */
function utcKey(year: number, monthIndex: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseKey(dateKey: string): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

/** «вторник, 10 ноября» — по настенной дате; зона UTC, чтобы части не съехали. */
function dayTitle(dateKey: string): string {
  const { year, monthIndex, day } = parseKey(dateKey);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(Date.UTC(year, monthIndex, day));
}

/** «ноябрь 2026» — именительный падеж, без «г.» (Intl с годом добавил бы его). */
function monthLabel(monthKey: string): string {
  const { year, monthIndex } = parseKey(`${monthKey}-01`);
  const month = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long' }).format(
    Date.UTC(year, monthIndex, 15),
  );
  return `${month} ${year}`;
}

function nextMonthKey(monthKey: string): string {
  const { year, monthIndex } = parseKey(`${monthKey}-01`);
  const d = new Date(Date.UTC(year, monthIndex + 1, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Сетка месяца: 42 клетки с понедельника перед 1-м числом (макет #13). */
function monthCells(
  monthKey: string,
  todayKey: string,
  windowEndKey: string,
  days: Record<string, CalendarDay>,
): CalendarCell[] {
  const { year, monthIndex } = parseKey(`${monthKey}-01`);
  const first = Date.UTC(year, monthIndex, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7; // пн = 0
  const start = first - offset * 86400000;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start + i * 86400000);
    const dateKey = utcKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const inMonth = d.getUTCFullYear() === year && d.getUTCMonth() === monthIndex;
    // ключи «ГГГГ-ММ-ДД» сравнимы лексикографически
    const inWindow = dateKey >= todayKey && dateKey <= windowEndKey;
    const count = days[dateKey]?.slots.length ?? 0;
    const state: CalendarCellState = !inMonth || !inWindow ? 'off' : count > 0 ? 'open' : 'zero';
    const label =
      state === 'off'
        ? ''
        : `${dayTitle(dateKey)}, ${count > 0 ? `свободных окон: ${count}` : 'свободных окон нет'}`;
    cells.push({
      dateKey,
      dayNumber: d.getUTCDate(),
      state,
      isToday: dateKey === todayKey,
      count,
      label,
    });
  }
  return cells;
}

/**
 * Календарь публичной страницы из свободных слотов: группировка по дням
 * APP_TZ, сетки месяцев окна (сегодня + 31 день — дефолт выборки API).
 */
export function buildBookingCalendar(
  slots: readonly { id: string; startsAt: string; endsAt: string }[],
  appTz: string,
  now: Date,
): BookingCalendar {
  const todayKey = wallDateKey(now, appTz);
  const { year, monthIndex, day } = parseKey(todayKey);
  const windowEndKey = utcKey(year, monthIndex, day + BOOKING_WINDOW_DAYS);

  const days: Record<string, CalendarDay> = {};
  for (const s of slots) {
    const dateKey = wallDateKey(new Date(s.startsAt), appTz);
    const calendarDay = (days[dateKey] ??= { dateKey, title: dayTitle(dateKey), slots: [] });
    calendarDay.slots.push({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      timeLabel: formatTimeRange(s.startsAt, s.endsAt, appTz),
    });
  }

  const months: CalendarMonth[] = [];
  for (let mk = todayKey.slice(0, 7); mk <= windowEndKey.slice(0, 7); mk = nextMonthKey(mk)) {
    months.push({
      key: mk,
      label: monthLabel(mk),
      cells: monthCells(mk, todayKey, windowEndKey, days),
    });
  }

  return { todayKey, windowEndKey, months, days };
}

/** Первый день с окнами (клетки хронологичны); нет таковых — null. */
export function firstOpenDateKey(calendar: BookingCalendar): string | null {
  for (const month of calendar.months) {
    const open = month.cells.find((c) => c.state === 'open');
    if (open) return open.dateKey;
  }
  return null;
}

/** «1 окно / 2 окна / 5 окон» — счётчик под числом в календаре. */
export function countWindows(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = 'окно';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = 'окна';
  else form = 'окон';
  return `${n} ${form}`;
}

/** Исход попытки брони: чему верит UI после ответа API (ADR-005 — только по коду). */
export type BookingFailure =
  | { kind: 'booked' } // SLOT_ALREADY_BOOKED
  | { kind: 'past' } // SLOT_IN_PAST
  | { kind: 'gone' } // NOT_FOUND — интервал удалён
  | { kind: 'invalid'; fields: Record<string, string>; messages: string[] }
  | { kind: 'network' }
  | { kind: 'unknown' };

interface ErrorEnvelopeLike {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

/** Разбор конверта ошибок POST /api/v1/bookings (ADR-005). */
export function bookingFailureFromApiError(error: unknown): BookingFailure {
  const body = (error as ErrorEnvelopeLike | null)?.error;
  if (!body || typeof body !== 'object') return { kind: 'unknown' };

  if (body.code === 'SLOT_ALREADY_BOOKED') return { kind: 'booked' };
  if (body.code === 'SLOT_IN_PAST') return { kind: 'past' };
  if (body.code === 'NOT_FOUND') return { kind: 'gone' };

  if (body.code === 'VALIDATION_ERROR') {
    const fields: Record<string, string> = {};
    const messages: string[] = [];
    if (Array.isArray(body.details)) {
      for (const item of body.details) {
        const field = (item as { field?: unknown }).field;
        const message = (item as { message?: unknown }).message;
        if (typeof field === 'string' && typeof message === 'string') {
          fields[field] = message;
          messages.push(message);
        }
      }
    }
    if (messages.length === 0 && typeof body.message === 'string' && body.message.length > 0) {
      messages.push(body.message);
    }
    return { kind: 'invalid', fields, messages };
  }

  return { kind: 'unknown' };
}

/** Тексты баннера-ошибки над списком окон (макет #13); поля — не баннер. */
export function bookingBanner(failure: BookingFailure): { title: string; text: string } | null {
  switch (failure.kind) {
    case 'booked':
      return {
        title: 'Это время только что заняли',
        text: 'Другой посетитель забронировал слот раньше вас. Список обновлён — выберите другое окно.',
      };
    case 'past':
      return {
        title: 'Это время уже прошло',
        text: 'Окно началось, пока вы заполняли форму. Список обновлён — выберите другое окно.',
      };
    case 'gone':
      return {
        title: 'Окно снято с публикации',
        text: 'Владелец удалил этот интервал. Список обновлён — выберите другое окно.',
      };
    case 'network':
      return {
        title: 'Не удалось связаться с сервером',
        text: 'Проверьте подключение и попробуйте ещё раз.',
      };
    case 'unknown':
      return {
        title: 'Не удалось забронировать звонок',
        text: 'Что-то пошло не так. Попробуйте ещё раз или выберите другое окно.',
      };
    case 'invalid':
      return null;
  }
}
