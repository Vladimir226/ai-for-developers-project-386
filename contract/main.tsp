import "@typespec/http";
import "@typespec/openapi";

import "./errors.tsp";
import "./models.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * REST API «Запись на звонок».
 *
 * ADR-010: TypeSpec — единственный источник истины API. OpenAPI, типы SDK и
 * Zod-схемы генерируются (`npm run contract:gen`) в `src/generated/` и
 * коммитятся. Сервер реализуется по контракту вручную (Route Handlers) и
 * проверяется integration-тестами, парсящими ответы сгенерированными схемами.
 *
 * Время — ISO-8601 UTC (ADR-009). AuthN нет (ADR-003). Версионирование —
 * префикс /api/v1 (ломающие изменения — новый префикс).
 * GET /api/health сюда не входит (инфраструктурный, без версии).
 */
@service(#{
  title: "Book-a-Call API",
})
@info(#{
  version: "1.0.0",
})
@server("/", "UI и API живут в одном приложении — self-fetch (ADR-004)")
namespace BookACall;

// ── Слоты ───────────────────────────────────────────────────────────────────

/** Слоты периода: `view=free` — только свободные будущие (публичная страница), `view=all` — все интервалы, включая забронированные и прошедшие (админ, FR-002). `from`/`to` опциональны. */
@summary("Слоты периода")
@route("/api/v1/slots")
@get
op listSlots(
  /** Начало периода (ISO-8601 UTC); по умолчанию — сейчас. */
  @query("from") from?: utcDateTime,
  /** Конец периода (ISO-8601 UTC); по умолчанию — сейчас + 31 день. */
  @query("to") to?: utcDateTime,
  /** Режим выборки; по умолчанию `free`. */
  @query("view") view?: SlotView = SlotView.free,
): SlotList | ValidationFailed;

/** Опубликовать интервал: `startsAt` в будущем, `endsAt` > `startsAt` (ADR-008, ADR-009). 409 — пересечение с существующим интервалом (`SLOT_OVERLAP`). */
@summary("Опубликовать интервал")
@route("/api/v1/slots")
@post
op createSlot(@body body: CreateSlotRequest): SlotCreated | ValidationFailed | ConflictError;

/** Удалить интервал вместе с активной бронью (ADR-008). */
@summary("Удалить интервал")
@route("/api/v1/slots/{id}")
@delete
op deleteSlot(@path id: string): NoContentResponse | NotFoundError;

// ── Брони ───────────────────────────────────────────────────────────────────

/** Список броней владельца. */
@summary("Список броней")
@route("/api/v1/bookings")
@get
op listBookings(): BookingList;

/** Забронировать слот: ровно одна активная бронь на слот (NFR-002). 404 — слота нет; 409 — `SLOT_ALREADY_BOOKED` или `SLOT_IN_PAST`. */
@summary("Забронировать слот")
@route("/api/v1/bookings")
@post
op createBooking(
  @body body: CreateBookingRequest,
): BookingCreated | NotFoundError | ValidationFailed | ConflictError;

/** Отменить бронь — слот снова становится свободным. */
@summary("Отменить бронь")
@route("/api/v1/bookings/{id}")
@delete
op deleteBooking(@path id: string): NoContentResponse | NotFoundError;
