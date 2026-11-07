// Чистая логика админ-страницы (ADR-004: UI тонкий, правил не содержит).
// Право veto остаётся за сервером: эти функции только объясняют пользователю
// уже состоявшийся ответ API. Локальная проверка пересечения повторяет
// предикат домена [startsAt; endsAt) намеренно: прямой импорт доменного
// модуля в UI-слой запрещён ADR-010, а подсказка — косметика, не правило.

/** Статус слота в списке: бейджи макета admin.html (#13). */
export type SlotStatus = 'free' | 'booked' | 'past';

/**
 * Окно списка админ-страницы, дни в обе стороны от «сейчас»: видно недавнее
 * прошлое («Прошёл») и горизонт планирования. 31 день — зеркально дефолтному
 * периоду GET /api/v1/slots (src/lib/validation/slot.ts).
 */
export const ADMIN_WINDOW_DAYS = 31;

/**
 * «Прошёл» приоритетнее: закончившийся звонок не «забронирован» в макете.
 * «Идёт прямо сейчас» ещё не прошёл (полуинтервал endsAt ещё не достигнут).
 */
export function slotStatus(
  slot: { id: string; startsAt: string; endsAt: string },
  bookedSlotIds: ReadonlySet<string>,
  now: Date,
): SlotStatus {
  if (new Date(slot.endsAt).getTime() <= now.getTime()) return 'past';
  return bookedSlotIds.has(slot.id) ? 'booked' : 'free';
}

/** Исход отправки одной строки формы: чему верит UI после ответа API. */
export type SubmitOutcome =
  | { kind: 'created' }
  | { kind: 'overlap' }
  | { kind: 'invalid'; messages: string[] }
  | { kind: 'network' }
  | { kind: 'unknown' };

interface ErrorEnvelopeLike {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

/** Разбор конверта ошибок (ADR-005): клиент интерпретирует только по коду. */
export function outcomeFromApiError(error: unknown): SubmitOutcome {
  const body = (error as ErrorEnvelopeLike | null)?.error;
  if (!body || typeof body !== 'object') return { kind: 'unknown' };

  if (body.code === 'SLOT_OVERLAP') return { kind: 'overlap' };

  if (body.code === 'VALIDATION_ERROR') {
    const details = body.details;
    if (Array.isArray(details)) {
      const messages = details
        .map((d) => (d as { message?: unknown }).message)
        .filter((m): m is string => typeof m === 'string');
      if (messages.length > 0) return { kind: 'invalid', messages };
    }
    if (typeof body.message === 'string' && body.message.length > 0) {
      return { kind: 'invalid', messages: [body.message] };
    }
  }

  return { kind: 'unknown' };
}

export interface SlotLike {
  id?: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Первый опубликованный слот, пересекающий кандидат (полуинтервалы
 * [startsAt; endsAt), вплотную — не конфликт). Нужно для подсказки
 * «пересекается с 11:00–11:30» в алерте ошибки макета.
 */
export function findOverlappingSlot<T extends SlotLike>(
  candidate: { startsAt: string; endsAt: string },
  slots: readonly T[],
): T | undefined {
  const start = new Date(candidate.startsAt).getTime();
  const end = new Date(candidate.endsAt).getTime();
  return slots.find(
    (s) => new Date(s.startsAt).getTime() < end && new Date(s.endsAt).getTime() > start,
  );
}
