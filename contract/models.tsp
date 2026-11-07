import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace BookACall;

// Модели новой доменной модели (ADR-0011, карта #28 D1–D3): хранимые
// сущности — типы событий, рабочие часы и брони; слоты вычисляются на лету
// и идентификатора не имеют. Время — utcDateTime ISO-8601 UTC (ADR-009),
// имена полей — camelCase (ADR-006).

// ── Типы событий ────────────────────────────────────────────────────────────

/** Тип события (D1): вид брони с фиксированной длительностью; длительность слота и шаг стартов равны ей (D2). */
model EventType {
  /** Идентификатор типа (UUID). */
  @format("uuid")
  id: string;
  /** Название вида брони. */
  @minLength(1)
  @maxLength(100)
  title: string;
  /** Описание для гостя (необязательное). */
  @maxLength(500)
  description?: string;
  /** Длительность в целых минутах. */
  @minValue(15)
  @maxValue(180)
  durationMinutes: int32;
}

/** Тело ответа `GET /api/v1/event-types`. */
model EventTypeList {
  eventTypes: EventType[];
}

/** Редактируемые поля типа события — общие для создания и замены. */
model EventTypeDraft {
  /** Название вида брони. */
  @minLength(1)
  @maxLength(100)
  title: string;
  /** Описание для гостя (необязательное). */
  @maxLength(500)
  description?: string;
  /** Длительность в целых минутах. */
  @minValue(15)
  @maxValue(180)
  durationMinutes: int32;
}

/** Тело запроса `POST /api/v1/event-types`. */
model CreateEventTypeRequest extends EventTypeDraft {}

/** Тело запроса `PUT /api/v1/event-types/{id}` — полная замена полей. */
model UpdateEventTypeRequest extends EventTypeDraft {}

/** 201-ответ `POST /api/v1/event-types` — созданный тип. */
model EventTypeCreated extends EventType {
  @statusCode
  _: 201;
}

// ── Вычисляемые слоты ────────────────────────────────────────────────────────

/**
 * Вычисляемый свободный слот (ADR-0011): в БД не хранится и идентификатора
 * не имеет — генерируется внутри рабочих часов с шагом, равным длительности
 * типа (D2), целиком помещаясь в день; гостю предлагаются только слоты без
 * наложения на активные брони (D12).
 */
model Slot {
  /** Начало слота, ISO-8601 UTC. */
  startsAt: utcDateTime;
  /** Конец слота — `startsAt` + длительность типа, ISO-8601 UTC. */
  endsAt: utcDateTime;
}

/** Тело ответа `GET /api/v1/event-types/{id}/slots`. */
model SlotList {
  slots: Slot[];
}

// ── Рабочие часы ─────────────────────────────────────────────────────────────

/**
 * Рабочие часы одного дня недели (D3): интервал `[startMinutes; endMinutes)`
 * от полуночи или выходной. Перерывов внутри дня нет.
 */
model WorkingHoursDay {
  /** День недели: 0 — воскресенье … 6 — суббота (как `Date#getDay`). */
  @minValue(0)
  @maxValue(6)
  weekday: int32;
  /** Выходной: слоты в этот день не генерируются. */
  isDayOff: boolean;
  /** Начало дня в минутах от полуночи; обязательно, когда `isDayOff = false`. */
  @minValue(0)
  @maxValue(1440)
  startMinutes?: int32;
  /** Конец дня в минутах от полуночи (эксклюзивно); обязателен, когда `isDayOff = false`. */
  @minValue(0)
  @maxValue(1440)
  endMinutes?: int32;
}

/** Рабочие часы недели: ровно по одной записи на каждый день `0..6`. */
model WorkingHours {
  days: WorkingHoursDay[];
}

// ── Брони ────────────────────────────────────────────────────────────────────

/** Тип события, вложенный в бронь: длительность фиксируется на момент создания (ADR-0011). */
model BookingEventType {
  /** Идентификатор типа (UUID). */
  @format("uuid")
  id: string;
  /** Название вида брони. */
  @minLength(1)
  @maxLength(100)
  title: string;
  /** Длительность в целых минутах. */
  @minValue(15)
  @maxValue(180)
  durationMinutes: int32;
}

/** Бронь: встреча гостя на выбранный слот типа события. */
model Booking {
  /** Идентификатор брони (UUID). */
  @format("uuid")
  id: string;
  /** Забронированный тип события. */
  eventType: BookingEventType;
  /** Начало встречи, ISO-8601 UTC. */
  startsAt: utcDateTime;
  /** Конец встречи — `startsAt` + длительность типа, ISO-8601 UTC. */
  endsAt: utcDateTime;
  /** Имя бронирующего. */
  @minLength(1)
  @maxLength(100)
  bookerName: string;
  /** Контакт для связи (телефон/мессенджер/email). */
  @minLength(5)
  @maxLength(200)
  bookerContact: string;
  /** Комментарий к брони (необязателен). */
  @maxLength(500)
  comment?: string;
  /** Момент создания брони, ISO-8601 UTC. */
  createdAt: utcDateTime;
}

/** Тело ответа `GET /api/v1/bookings`. */
model BookingList {
  bookings: Booking[];
}

/** Тело запроса `POST /api/v1/bookings`. */
model CreateBookingRequest {
  /** Идентификатор типа события. */
  @format("uuid")
  eventTypeId: string;
  /** Начало слота, ISO-8601 UTC; слот должен быть будущим и свободным. */
  startsAt: utcDateTime;
  /** Имя бронирующего. */
  @minLength(1)
  @maxLength(100)
  bookerName: string;
  /** Контакт для связи. */
  @minLength(5)
  @maxLength(200)
  bookerContact: string;
  /** Комментарий (необязателен). */
  @maxLength(500)
  comment?: string;
}

/** 201-ответ `POST /api/v1/bookings` — созданная бронь. */
model BookingCreated extends Booking {
  @statusCode
  _: 201;
}
