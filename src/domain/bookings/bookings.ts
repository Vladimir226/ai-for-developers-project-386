import { Prisma } from '@prisma/client';
import { getDb } from '@/lib/db/prisma';
import type { CreateBookingInput } from '@/lib/validation/booking';

// Доменный модуль bookings (architecture.md §4): закрепление слота за
// посетителем. Антидубль — UNIQUE(slot_id) на уровне БД (ADR-008, NFR-002):
// при конкурентных INSERT ровно один выигрывает, проигравшие получают
// ошибку констрейнта (P2002), которую сервисный слой превращает в чистый
// 409 SLOT_ALREADY_BOOKED. Отмена брони — DELETE строки: слот снова свободен.

/** Запись брони, как её видит API-слой (startsAt/endsAt — копия из слота). */
export interface BookingRecord {
  id: string;
  slotId: string;
  bookerName: string;
  bookerContact: string;
  comment: string | null;
  createdAt: Date;
  startsAt: Date;
  endsAt: Date;
}

/** Бронь в JSON-форме контракта (camelCase, ISO-8601 UTC с Z — ADR-009). */
export interface BookingJson {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
  createdAt: string;
}

type BookingRow = Prisma.BookingGetPayload<{
  include: { slot: { select: { startsAt: true; endsAt: true } } };
}>;

function toRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    slotId: row.slotId,
    bookerName: row.bookerName,
    bookerContact: row.bookerContact,
    comment: row.comment,
    createdAt: row.createdAt,
    startsAt: row.slot.startsAt,
    endsAt: row.slot.endsAt,
  };
}

export function serializeBooking(booking: BookingRecord): BookingJson {
  const json: BookingJson = {
    id: booking.id,
    slotId: booking.slotId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    bookerName: booking.bookerName,
    bookerContact: booking.bookerContact,
    createdAt: booking.createdAt.toISOString(),
  };
  if (booking.comment !== null) json.comment = booking.comment;
  return json;
}

/** Список броней владельца: по возрастанию начала слота (админ-календарь). */
export async function listBookings(): Promise<BookingRecord[]> {
  const db = await getDb();

  const rows = await db.booking.findMany({
    include: { slot: { select: { startsAt: true, endsAt: true } } },
    orderBy: { slot: { startsAt: 'asc' } },
  });
  return rows.map(toRecord);
}

/** Отменяет бронь (DELETE строки — ADR-008); false — брони нет. */
export async function deleteBooking(id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db.booking.deleteMany({ where: { id } });
  return deleted.count > 0;
}

export type CreateBookingResult =
  | { ok: true; booking: BookingRecord }
  | { ok: false; reason: 'slot-not-found' }
  | { ok: false; reason: 'slot-in-past' }
  | { ok: false; reason: 'slot-already-booked' };

export async function createBooking(
  input: CreateBookingInput,
  now: Date,
): Promise<CreateBookingResult> {
  const db = await getDb();

  const slot = await db.slot.findUnique({
    where: { id: input.slotId },
    select: { startsAt: true, endsAt: true },
  });
  if (!slot) {
    return { ok: false, reason: 'slot-not-found' as const };
  }
  // GLOSSARY «свободный слот»: бронируемый интервал целиком в будущем.
  // Проверка идёт до занятости: слот и занят, и в прошлом → SLOT_IN_PAST
  // (аддендум #6, пиннится тестом).
  if (slot.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'slot-in-past' as const };
  }

  let booking;
  try {
    booking = await db.booking.create({
      data: {
        slotId: input.slotId,
        bookerName: input.bookerName,
        bookerContact: input.bookerContact,
        comment: input.comment ?? null,
      },
      include: { slot: { select: { startsAt: true, endsAt: true } } },
    });
  } catch (error) {
    // UNIQUE(slot_id) — истина последней инстанции (ADR-008): конкурентный
    // запрос проиграл гонку за слот — чистый 409 вместо сырой ошибки БД.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'slot-already-booked' as const };
    }
    throw error;
  }

  return { ok: true, booking: toRecord(booking) };
}
