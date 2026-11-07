import { Prisma } from '@prisma/client';
import { getDb } from '@/lib/db/prisma';
import type { EventTypeDraftInput } from '@/lib/validation/event-type';

// Доменный модуль event-types (architecture.md §4): CRUD типов событий
// (D1) поверх Prisma. Бизнес-правил сверх валидации контракта нет —
// модуль держит форму записи/сериализации и каскад удаления (D4).
// Изменение durationMinutes не пересчитывает созданные брони: их интервалы
// фиксируются на момент создания (ADR-0011).

/** Запись типа события, как её видит API-слой. */
export interface EventTypeRecord {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
}

/** Тип события в JSON-форме контракта (camelCase — ADR-006). */
export interface EventTypeJson {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
}

export function serializeEventType(eventType: EventTypeRecord): EventTypeJson {
  const json: EventTypeJson = {
    id: eventType.id,
    title: eventType.title,
    durationMinutes: eventType.durationMinutes,
  };
  if (eventType.description !== null) json.description = eventType.description;
  return json;
}

/** Список типов в порядке создания (страница видов брони и панель). */
export async function listEventTypes(): Promise<EventTypeRecord[]> {
  const db = await getDb();
  return db.eventType.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

export async function createEventType(draft: EventTypeDraftInput): Promise<EventTypeRecord> {
  const db = await getDb();
  return db.eventType.create({
    data: {
      title: draft.title,
      description: draft.description ?? null,
      durationMinutes: draft.durationMinutes,
    },
  });
}

/** Полная замена полей; null — типа нет (P2025 → не найден). */
export async function updateEventType(
  id: string,
  draft: EventTypeDraftInput,
): Promise<EventTypeRecord | null> {
  const db = await getDb();

  try {
    return await db.eventType.update({
      where: { id },
      data: {
        title: draft.title,
        description: draft.description ?? null,
        durationMinutes: draft.durationMinutes,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/** Удаляет тип каскадно вместе с его бронями (D4, FK ON DELETE CASCADE). */
export async function deleteEventType(id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db.eventType.deleteMany({ where: { id } });
  return deleted.count > 0;
}
