import { getAppTz } from '@/lib/time/app-tz';
import { wallTimeToUtcIso } from '@/lib/time/wall-time';
import { getDb } from '@/lib/db/prisma';
import { intervalsOverlap, type Interval } from './intervals';
import { getWorkingHours } from './working-hours';

// Доменный модуль availability (architecture.md §4): вычисляемые слоты
// (ADR-0011, карта #28). Генератор — чистая функция без БД (шов 3);
// список свободных слотов — композиция «тип × рабочие часы × брони» поверх
// Prisma (шов 1). Слоты нигде не хранятся и идентификаторов не имеют.

/** Рабочие часы одного дня недели (D3): минуты от полуночи стены APP_TZ. */
export interface WorkingDayHours {
  /** 0 — воскресенье … 6 — суббота (как `Date#getDay`). */
  weekday: number;
  isDayOff: boolean;
  startMinutes: number;
  endMinutes: number;
}

/** Слот — полуинтервал [startsAt; endsAt) длительности типа (D2). */
export type GeneratedSlot = Interval;

export interface GenerateSlotsInput {
  /** Начало периода генерации (UTC-инстант). */
  from: Date;
  /** Конец периода генерации (UTC-инстант). */
  to: Date;
  /** Длительность типа в минутах: длина слота и шаг стартов (D2). */
  durationMinutes: number;
  workingHours: WorkingDayHours[];
  /** Зона стены рабочих часов и календаря (APP_TZ, ADR-009). */
  timeZone: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Окно записи — 14 дней (D6); период запроса может быть шире (надмножество),
// но ограничиваем генерацию 400 днями, чтобы экзотический from/to не крутил
// цикл годами: за пределами окна записи слоты гостю всё равно не нужны.
const MAX_PERIOD_DAYS = 400;

function wallDateKey(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function minutesToWallTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Генерирует слоты периода: по каждому календарному дню стены (timeZone)
 * от `from` до `to` — старты внутри рабочих часов с шагом = длительности
 * типа (D2); слот должен целиком помещаться в часы дня; выходные и дни
 * без записи пропускаются (D3). Оставляет старты в [from; to], границы
 * включены. Дни идут по возрастанию, старты внутри дня — тоже: результат
 * отсортирован по startsAt (зона без DST — Europe/Moscow, ADR-009).
 */
export function generateSlots(input: GenerateSlotsInput): GeneratedSlot[] {
  const { from, to, durationMinutes, workingHours, timeZone } = input;
  if (to.getTime() < from.getTime()) return [];

  const firstDay = wallDateKey(from, timeZone);
  const lastDay = wallDateKey(to, timeZone);
  const firstDayUtcMs = Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day);
  const lastDayUtcMs = Date.UTC(lastDay.year, lastDay.month - 1, lastDay.day);
  const cappedLastDayUtcMs = Math.min(
    lastDayUtcMs,
    firstDayUtcMs + (MAX_PERIOD_DAYS - 1) * DAY_MS,
  );

  const slots: GeneratedSlot[] = [];
  for (let dayUtcMs = firstDayUtcMs; dayUtcMs <= cappedLastDayUtcMs; dayUtcMs += DAY_MS) {
    const anchor = new Date(dayUtcMs);
    const weekday = anchor.getUTCDay();
    const dayHours = workingHours.find((hours) => hours.weekday === weekday);
    if (!dayHours || dayHours.isDayOff) continue;

    const date = anchor.toISOString().slice(0, 10);
    for (
      let start = dayHours.startMinutes;
      start + durationMinutes <= dayHours.endMinutes;
      start += durationMinutes
    ) {
      // «Настенные» минуты дня → UTC-инстант зоны (ADR-009); 24:00 как конец
      // часов не конвертируется — стартов на границе 1440 не бывает
      const startsAt = new Date(wallTimeToUtcIso(date, minutesToWallTime(start), timeZone));
      if (startsAt < from || startsAt > to) continue;
      slots.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000),
      });
    }
  }
  return slots;
}

export type FreeSlotsResult =
  | { ok: true; slots: GeneratedSlot[] }
  | { ok: false; reason: 'event-type-not-found' };

/**
 * Свободные слоты типа в периоде (ADR-0011): кандидаты генерируются из
 * рабочих часов (дефолт D3 — пока владелец их не задал), затем вычитаются
 * брони — слот свободен, если не пересекается ни с одной активной бронью
 * любого типа (D12). Спецификация пересечения — intervalsOverlap; предикат
 * запроса — его хранилищный двойник, соответствие пиннится API-тестами.
 */
export async function listFreeSlots(
  eventTypeId: string,
  query: { from: Date; to: Date },
): Promise<FreeSlotsResult> {
  const db = await getDb();

  const eventType = await db.eventType.findUnique({
    where: { id: eventTypeId },
    select: { durationMinutes: true },
  });
  if (!eventType) {
    return { ok: false, reason: 'event-type-not-found' as const };
  }

  const workingHours = await getWorkingHours();
  const candidates = generateSlots({
    from: query.from,
    to: query.to,
    durationMinutes: eventType.durationMinutes,
    workingHours,
    timeZone: getAppTz(),
  });
  if (candidates.length === 0) {
    return { ok: true, slots: [] };
  }

  // Бронь влияет на слоты периода, только если пересекает его размах
  const periodStart = candidates[0]!.startsAt;
  const periodEnd = candidates[candidates.length - 1]!.endsAt;
  const bookings = await db.booking.findMany({
    where: { startsAt: { lt: periodEnd }, endsAt: { gt: periodStart } },
    select: { startsAt: true, endsAt: true },
  });

  return {
    ok: true,
    slots: candidates.filter((slot) => !bookings.some((booking) => intervalsOverlap(slot, booking))),
  };
}

/** Слот в JSON-форме контракта (ISO-8601 UTC с Z — ADR-009). */
export interface SlotJson {
  startsAt: string;
  endsAt: string;
}

export function serializeSlot(slot: GeneratedSlot): SlotJson {
  return { startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() };
}
