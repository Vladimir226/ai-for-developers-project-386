import "@typespec/http";

using TypeSpec.Http;

namespace BookACall;

/** Стабильные машинные коды ошибок API (ADR-005): клиент интерпретирует ошибки только по ним. */
enum ErrorCode {
  /** Ошибка валидации полей (422); `details` — список невалидных полей. */
  VALIDATION_ERROR: "VALIDATION_ERROR";
  /** Ресурс не найден (404). */
  NOT_FOUND: "NOT_FOUND";
  /** Интервал занят: наложение с любой активной бронью, включая другие типы событий (409, D12). */
  SLOT_ALREADY_BOOKED: "SLOT_ALREADY_BOOKED";
  /** Слот уже начался или прошёл (409). */
  SLOT_IN_PAST: "SLOT_IN_PAST";
}

/** Элемент `error.details` для `VALIDATION_ERROR`. */
model ValidationErrorItem {
  /** Имя невалидного поля (camelCase, ADR-006). */
  field: string;
  /** Человекочитаемое сообщение (ru). */
  message: string;
}

/** Тело ошибки (ADR-005). */
model ErrorBody {
  code: ErrorCode;
  /** Человекочитаемое сообщение (ru). */
  message: string;
  /** Дополнительные машиночитательные данные; для `VALIDATION_ERROR` — список невалидных полей. */
  details?: ValidationErrorItem[];
}

/** Конверт ошибок API (ADR-005): `{"error": {"code", "message", "details"?}}`. */
model ErrorEnvelope {
  error: ErrorBody;
}

/** 422 — ошибка валидации полей. */
@error
model ValidationFailed {
  @statusCode
  _: 422;
  ...ErrorEnvelope;
}

/** 404 — ресурс не найден. */
@error
model NotFoundError {
  @statusCode
  _: 404;
  ...ErrorEnvelope;
}

/** 409 — конфликт состояния: `SLOT_ALREADY_BOOKED`, `SLOT_IN_PAST`. */
@error
model ConflictError {
  @statusCode
  _: 409;
  ...ErrorEnvelope;
}
