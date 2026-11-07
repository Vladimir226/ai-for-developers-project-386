import type { Prisma } from '@prisma/client';
import { getDb } from '@/lib/db/prisma';
import type { CreateBookingInput } from '@/lib/validation/booking';

// Доменный модуль bookings (architecture.md §4): закрепление вычисляемого
// слота за гостем (ADR-0011). Антидубль — транзакция с предикатом наложения
// с любой активной бронью, включая другие типы (D12): UNIQUE(slot_id) из
// ADR-0008 ушёл вместе с хранимыми слотами.
//
// Гонки держит пара «очередь + транзакция»: параллельные createBooking
// выстраиваются в цепочку промисов (приложение — один процесс в одном
// контейнере, ADR-002/ADR-007), поэтому проверки и INSERT не исполняются
// вперемешку — на CI подтверждено, что конкурентные интерактивные
// транзакции Prisma на SQLite при interleaving чтений дают contention
// stale-snapshot (зависание до таймаута), а не честный 409. Транзакция под
// ними сохраняет атомарность «предикат + вставка» против остальных пишущих
// (одиночный писатель SQLite). Поведение пиннится тестом гонки в
// route.test.ts (8 параллельных POST → ровно один 201).

/** Запись брони, как её видит API-слой (тип вложен — контракт v2). */
export interface BookingRecord {
  id: string;
  eventType: { id: string; title: string; durationMinutes: number };
  startsAt: Date;
  endsAt: Date;
  bookerName: string;
  bookerContact: string;
  comment: string | null;
  createdAt: Date;
}

/** Предстоящая ли бронь: встреча ещё не закончилась — конец ≥ сейчас. */
export function isUpcoming(booking: Pick<BookingRecord, 'endsAt'>, now: Date): boolean {
  return booking.endsAt.getTime() >= now.getTime();
}

/** Бронь в JSON-форме контракта (camelCase, ISO-8601 UTC с Z — ADR-009). */
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

type BookingRow = Prisma.BookingGetPayload<{ include: { eventType: true } }>;

function toRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    eventType: {
      id: row.eventType.id,
      title: row.eventType.title,
      durationMinutes: row.eventType.durationMinutes,
    },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    bookerName: row.bookerName,
    bookerContact: row.bookerContact,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}

export function serializeBooking(booking: BookingRecord): BookingJson {
  const json: BookingJson = {
    id: booking.id,
    eventType: booking.eventType,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    bookerName: booking.bookerName,
    bookerContact: booking.bookerContact,
    createdAt: booking.createdAt.toISOString(),
  };
  if (booking.comment !== null) json.comment = booking.comment;
  return json;
}

/**
 * Список броней владельца по возрастанию начала. `upcoming` — только
 * предстоящие: конец ≥ сейчас (спецификация — isUpcoming, SQL-двойник —
 * `endsAt >= now`; соответствие пиннится API-тестом).
 */
export async function listBookings(
  options: { upcoming?: boolean } = {},
  now: Date,
): Promise<BookingRecord[]> {
  const db = await getDb();

  const rows = await db.booking.findMany({
    where: options.upcoming ? { endsAt: { gte: now } } : undefined,
    include: { eventType: true },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toRecord);
}

export type CreateBookingResult =
  | { ok: true; booking: BookingRecord }
  | { ok: false; reason: 'event-type-not-found' }
  | { ok: false; reason: 'slot-in-past' }
  | { ok: false; reason: 'slot-already-booked' };

/**
 * Бронирует интервал [startsAt; startsAt + длительность типа). Выполняется
 * через очередь: одновременно в процессе — одна проверка+вставка (см.
 * комментарий модуля). Внутри транзакции тип не удалится между проверкой и
 * INSERT (каскад D4), наложение проверяется в том же снапшоте, в котором
 * пишем. Приоритет ошибок: неизвестный тип (404) → прошлое время (409) →
 * занятость (409). Изменение длительности типа не пересчитывает созданные
 * брони — интервал фиксируется на момент создания (ADR-0011).
 */
export async function createBooking(
  input: CreateBookingInput,
  now: Date,
): Promise<CreateBookingResult> {
  const result = bookingQueue.then(() => createBookingSerialized(input, now));
  bookingQueue = result.catch(() => undefined);
  return result;
}

let bookingQueue: Promise<unknown> = Promise.resolve();

async function createBookingSerialized(
  input: CreateBookingInput,
  now: Date,
): Promise<CreateBookingResult> {
  const db = await getDb();

  return db.$transaction(async (tx) => {
    const eventType = await tx.eventType.findUnique({
      where: { id: input.eventTypeId },
      select: { id: true, title: true, durationMinutes: true },
    });
    if (!eventType) {
      return { ok: false, reason: 'event-type-not-found' as const };
    }

    // GLOSSARY «свободный слот»: бронируемый интервал целиком в будущем.
    // Проверка идёт до занятости: слот и в прошлом, и занят → SLOT_IN_PAST
    // (аддендум №1, пиннится тестом).
    if (input.startsAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'slot-in-past' as const };
    }

    const startsAt = input.startsAt;
    const endsAt = new Date(startsAt.getTime() + eventType.durationMinutes * 60 * 1000);

    // D12: наложение с любой активной бронью, включая другие типы;
    // полуинтервалы, примыкание допустимо — двойник intervalsOverlap
    const overlapping = await tx.booking.findFirst({
      where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { id: true },
    });
    if (overlapping) {
      return { ok: false, reason: 'slot-already-booked' as const };
    }

    const created = await tx.booking.create({
      data: {
        eventTypeId: eventType.id,
        startsAt,
        endsAt,
        bookerName: input.bookerName,
        bookerContact: input.bookerContact,
        comment: input.comment ?? null,
      },
      include: { eventType: true },
    });
    return { ok: true, booking: toRecord(created) };
  });
}

/** Отменяет бронь (DELETE строки — время снова свободно для всех типов). */
export async function deleteBooking(id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db.booking.deleteMany({ where: { id } });
  return deleted.count > 0;
}
