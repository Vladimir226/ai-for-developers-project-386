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
 * Доменная модель — ADR-0011 (карта #28, D1–D12): хранимые сущности — типы
 * событий, рабочие часы и брони; слоты вычисляются на лету и не хранятся.
 * Ручная публикация интервалов (`POST/DELETE /api/v1/slots`, `view=free|all`)
 * ушла вместе с ADR-008.
 *
 * Время — ISO-8601 UTC (ADR-009). AuthN нет (ADR-003). Версионирование —
 * префикс /api/v1 (ломающие изменения — новый префикс).
 * GET /api/health сюда не входит (инфраструктурный, без версии).
 */
@service(#{
  title: "Book-a-Call API",
})
@info(#{
  version: "2.0.0",
})
@server("/", "UI и API живут в одном приложении — self-fetch (ADR-004)")
namespace BookACall;

// ── Типы событий ────────────────────────────────────────────────────────────

/** Список типов событий: страница видов брони для гостя и панель владельца. */
@summary("Список типов событий")
@route("/api/v1/event-types")
@get
op listEventTypes(): EventTypeList;

/** Создать тип события (владелец): название 1..100, описание ≤500, длительность 15..180 минут. */
@summary("Создать тип события")
@route("/api/v1/event-types")
@post
op createEventType(@body body: CreateEventTypeRequest): EventTypeCreated | ValidationFailed;

/** Изменить тип события (владелец): полная замена полей. 404 — типа нет. */
@summary("Изменить тип события")
@route("/api/v1/event-types/{id}")
@put
op updateEventType(@path id: string, @body body: UpdateEventTypeRequest):
  | EventType
  | NotFoundError
  | ValidationFailed;

/**
 * Удалить тип события (владелец) — каскадно вместе с его бронями (D4):
 * время освобождается для остальных типов.
 */
@summary("Удалить тип события")
@route("/api/v1/event-types/{id}")
@delete
op deleteEventType(@path id: string): NoContentResponse | NotFoundError;

// ── Вычисляемые слоты ────────────────────────────────────────────────────────

/**
 * Вычисляемые свободные слоты типа (ADR-0011): старты внутри рабочих часов с
 * шагом, равным длительности типа (D2), слот целиком помещается в день; окно
 * записи — 14 календарных дней с сегодня по `APP_TZ` (D6). `from`/`to`
 * опциональны. 404 — типа нет.
 */
@summary("Свободные слоты типа")
@route("/api/v1/event-types/{id}/slots")
@get
op listEventTypeSlots(
  @path id: string,
  /** Начало периода (ISO-8601 UTC); по умолчанию — сейчас. */
  @query("from") from?: utcDateTime,
  /** Конец периода (ISO-8601 UTC); по умолчанию — сейчас + 14 дней (окно записи, D6). */
  @query("to") to?: utcDateTime,
): SlotList | NotFoundError | ValidationFailed;

// ── Рабочие часы ─────────────────────────────────────────────────────────────

/** Текущие рабочие часы недели (D3): по одной записи на каждый день 0..6. */
@summary("Рабочие часы недели")
@route("/api/v1/working-hours")
@get
op getWorkingHours(): WorkingHours;

/**
 * Задать рабочие часы недели (владелец): ровно 7 дней, у рабочего дня
 * `startMinutes < endMinutes`, у выходного минуты не нужны. Перерывы внутри
 * дня не поддерживаются (D3).
 */
@summary("Задать рабочие часы")
@route("/api/v1/working-hours")
@put
op putWorkingHours(@body body: WorkingHours): WorkingHours | ValidationFailed;

// ── Брони ────────────────────────────────────────────────────────────────────

/**
 * Список броней владельца. `upcoming` — резерв фильтра «предстоящие»
 * (реализация — #36); без параметра возвращаются все брони.
 */
@summary("Список броней")
@route("/api/v1/bookings")
@get
op listBookings(
  /** Только предстоящие брони (резерв, #36). */
  @query("upcoming") upcoming?: boolean,
): BookingList;

/**
 * Забронировать слот типа события: интервал — полуинтервал от `startsAt`
 * до `startsAt` + длительность типа. 404 — типа нет; 409 — `SLOT_IN_PAST`
 * (слот прошёл) или `SLOT_ALREADY_BOOKED` (наложение с любой активной
 * бронью, включая другие типы — D12; примыкание допустимо).
 */
@summary("Забронировать слот")
@route("/api/v1/bookings")
@post
op createBooking(
  @body body: CreateBookingRequest,
): BookingCreated | NotFoundError | ValidationFailed | ConflictError;

/** Отменить бронь — время снова становится свободным для всех типов. */
@summary("Отменить бронь")
@route("/api/v1/bookings/{id}")
@delete
op deleteBooking(@path id: string): NoContentResponse | NotFoundError;
