import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

namespace BookACall;

/** Режим выборки слотов (FR-002). */
enum SlotView {
  /** Только слоты без активной брони, целиком в будущем. */
  free: "free";
  /** Все интервалы, включая забронированные и прошедшие (админ). */
  all: "all";
}

/** Опубликованный интервал времени, доступный для бронирования. */
model Slot {
  /** Идентификатор слота (UUID). */
  @format("uuid")
  id: string;
  /** Начало интервала, ISO-8601 UTC. */
  startsAt: utcDateTime;
  /** Конец интервала, ISO-8601 UTC; строго позже начала (ADR-008). */
  endsAt: utcDateTime;
}

/** Тело ответа `GET /api/v1/slots`. */
model SlotList {
  slots: Slot[];
}

/** Тело запроса `POST /api/v1/slots`. */
model CreateSlotRequest {
  /** Начало интервала, ISO-8601 UTC; в будущем. */
  startsAt: utcDateTime;
  /** Конец интервала, ISO-8601 UTC; строго позже начала. */
  endsAt: utcDateTime;
}

/** 201-ответ `POST /api/v1/slots` — созданный слот. */
model SlotCreated extends Slot {
  @statusCode
  _: 201;
}

/** Бронь звонка на слот. */
model Booking {
  /** Идентификатор брони (UUID). */
  @format("uuid")
  id: string;
  /** Идентификатор забронированного слота. */
  @format("uuid")
  slotId: string;
  /** Начало звонка (копия из слота), ISO-8601 UTC. */
  startsAt: utcDateTime;
  /** Конец звонка (копия из слота), ISO-8601 UTC. */
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
  /** Идентификатор бронируемого слота. */
  @format("uuid")
  slotId: string;
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
