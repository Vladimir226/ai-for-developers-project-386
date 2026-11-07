import type { Prisma } from '@prisma/client';
import { getDb } from '@/lib/db/prisma';
import type { SlotQuery } from '@/lib/validation/slot';
import type { Interval } from './intervals';

// Доменный модуль availability (architecture.md §4): правила интервалов
// поверх Prisma — единственное место бизнес-правил слотов (ADR-008).
// Право создавать прошедшие интервалы есть только у тестового сеяния
// (минуя модуль), продакшн-путь — только через createSlot с валидацией.

/** Запись слота, как её видит API-слой (createdAt в контракт не входит). */
export interface SlotRecord {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

/** Слот в JSON-форме контракта (camelCase, ISO-8601 UTC с Z — ADR-009). */
export interface SlotJson {
  id: string;
  startsAt: string;
  endsAt: string;
}

export function serializeSlot(slot: SlotRecord): SlotJson {
  return {
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  };
}

export type CreateSlotResult =
  { ok: true; slot: SlotRecord } | { ok: false; reason: 'slot-overlap' };

/**
 * Создаёт интервал. Пересечение с существующим слотом запрещено (ADR-008):
 * полуинтервалы [startsAt; endsAt), соседние вплотную — допустимы.
 *
 * Пара «проверка пересечения + вставка» атомарна в масштабе процесса:
 * параллельные публикации выстраиваются в очередь (приложение — один
 * процесс в одном контейнере, ADR-002/ADR-007). Спецификация правила —
 * intervalsOverlap (unit); SQL-предикат в createSlotSerialized — его
 * хранилищный двойник, соответствие пиннится integration-тестами.
 */
export function createSlot(input: Interval): Promise<CreateSlotResult> {
  const result = publicationQueue.then(() => createSlotSerialized(input));
  publicationQueue = result.catch(() => undefined);
  return result;
}

let publicationQueue: Promise<unknown> = Promise.resolve();

async function createSlotSerialized(input: Interval): Promise<CreateSlotResult> {
  const db = await getDb();

  return db.$transaction(async (tx) => {
    const overlapping = await tx.slot.findFirst({
      where: { startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
      select: { id: true },
    });
    if (overlapping) return { ok: false, reason: 'slot-overlap' as const };

    const slot = await tx.slot.create({
      data: { startsAt: input.startsAt, endsAt: input.endsAt },
    });
    return { ok: true as const, slot };
  });
}

/**
 * Слоты периода: `view=all` — все интервалы окна `[from; to]` по `startsAt`;
 * `view=free` — только целиком будущие (`startsAt > now`) и без активной
 * брони (GLOSSARY «свободный слот»; брони нет — слот свободен, US-12).
 * Сортировка — по возрастанию начала (индекс starts_at, NFR-005).
 */
export async function listSlots(query: SlotQuery, now: Date): Promise<SlotRecord[]> {
  const db = await getDb();

  const windowFilter: Prisma.SlotWhereInput = { startsAt: { gte: query.from, lte: query.to } };
  const where: Prisma.SlotWhereInput =
    query.view === 'free'
      ? { AND: [windowFilter, { startsAt: { gt: now } }, { bookings: { none: {} } }] }
      : windowFilter;

  return db.slot.findMany({ where, orderBy: { startsAt: 'asc' } });
}

/** Удаляет интервал; false — слота нет. Каскад на бронь доедет с Booking (#6). */
export async function deleteSlot(id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db.slot.deleteMany({ where: { id } });
  return deleted.count > 0;
}
