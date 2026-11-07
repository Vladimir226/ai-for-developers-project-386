import { formatInterval } from '@/lib/time/display';

// Чистая логика админ-страницы (ADR-004: UI тонкий, правил не содержит).
// Право veto остаётся за сервером: эти функции только объясняют пользователю
// уже состоявшийся ответ API. Локальная проверка пересечения повторяет
// предикат домена [startsAt; endsAt) намеренно: прямой импорт доменного
// модуля в UI-слой запрещён ADR-010, а подсказка — косметика, не правило.

/** Статус слота в списке: бейджи макета admin.html (#13). */
export type SlotStatus = 'free' | 'booked' | 'past';

/**
 * Границы запроса списка админ-страницы: «все опубликованные интервалы»
 * (FR-002) — от эпохи до далёкого будущего. Дефолтное окно API
 * (now..now+31 день) скрыло бы прошедшие интервалы («Прошёл») и дальние
 * планы. Порядок from <= to требуется схемой GET /api/v1/slots.
 */
export function adminWindow(): { from: string; to: string } {
  return { from: '1970-01-01T00:00:00.000Z', to: '9999-12-31T23:59:59.999Z' };
}

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

/** Неудачный исход — всё, кроме 'created' (для строк, оставшихся в форме). */
export type SubmitFailure = Exclude<SubmitOutcome, { kind: 'created' }>;

interface ErrorEnvelopeLike {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

/** Разбор конверта ошибок (ADR-005): клиент интерпретирует только по коду. */
export function outcomeFromApiError(error: unknown): SubmitFailure {
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
  startsAt: string;
  endsAt: string;
}

/**
 * Первый опубликованный слот, пересекающий кандидат (полуинтервалы
 * [startsAt; endsAt), вплотную — не конфликт). Нужно для подсказки
 * «пересекается с 11:00–11:30» в алерте ошибки макета. Дженерик сохраняет
 * тип элементов списка (включая id) для вызывающего.
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

// ── Брони (тикет #8) ─────────────────────────────────────────────────────────

/** Бронь в JSON-форме контракта (Booking из models.tsp) — поля, нужные карточке. */
export interface BookingLike {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
}

/**
 * Карточка брони для рендера: все надписи (кроме метки зоны на всю секцию)
 * готовы заранее на сервере в APP_TZ (ADR-009) — клиент ничего не форматирует.
 */
export interface BookingCard {
  id: string;
  bookerName: string;
  bookerContact: string;
  comment: string | null;
  /** «вт, 10 ноября · 10:30–11:00» — formatInterval макета admin.html. */
  timeLabel: string;
}

/**
 * Карточки броней секции «Брони»; null (само-фетч не удался) проходит
 * насквозь — по нему рендерится карточка повтора, как у интервалов.
 * Порядок сохраняется от API (GET /bookings — по возрастанию начала слота).
 */
export function buildBookingCards(
  bookings: readonly BookingLike[] | null,
  appTz: string,
): BookingCard[] | null {
  if (bookings === null) return null;
  return bookings.map((b) => ({
    id: b.id,
    bookerName: b.bookerName,
    bookerContact: b.bookerContact,
    comment: b.comment ?? null,
    timeLabel: formatInterval(b.startsAt, b.endsAt, appTz),
  }));
}

/** Исход попытки отмены брони: чему верит UI после ответа API. */
export type CancelOutcome = 'cancelled' | 'already-gone' | 'unknown';

/**
 * Разбор ошибки отмены (ADR-005): контракт DELETE /api/v1/bookings/{id} кроме
 * 204 описывает только 404 — бронь уже отменена (другое окно или удалённый
 * вместе с интервалом слот). Остальное — неизвестные отказы.
 */
export function cancelOutcomeFromApiError(error: unknown): Exclude<CancelOutcome, 'cancelled'> {
  const body = (error as ErrorEnvelopeLike | null)?.error;
  return body?.code === 'NOT_FOUND' ? 'already-gone' : 'unknown';
}

/**
 * Текст уведомления после попытки отмены; null — уведомление не нужно
 * (успех виден в самом списке после refresh, сетевой сбой лечится тем же
 * refresh по паттерну DeleteSlotButton).
 */
export function cancelNoticeText(outcome: CancelOutcome): string | null {
  return outcome === 'already-gone'
    ? 'Бронь уже отменена — возможно, в другом окне. Список показывает актуальное состояние.'
    : null;
}
