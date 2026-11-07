import { NextResponse } from 'next/server';
import { createBooking, listBookings, serializeBooking } from '@/domain/bookings/bookings';
import { readJsonBody } from '@/lib/http/json-body';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseCreateBookingBody, parseUpcomingParam } from '@/lib/validation/booking';

// Route Handlers броней (ADR-001): формы — контракт v2 (#32, ADR-010),
// конверт ошибок — ADR-005. Занятость — наложение интервалов с любой
// активной бронью, включая другие типы (D12), в транзакции с предикатом.
// 422 на битый JSON — компромисс из PR #4 (в контракте только 422).

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async (request) => {
  const url = new URL(request.url);
  const parsed = parseUpcomingParam(url.searchParams.get('upcoming') ?? undefined);
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидные параметры запроса', parsed.issues);
  }

  const bookings = await listBookings({ upcoming: parsed.value }, new Date());
  return NextResponse.json({ bookings: bookings.map(serializeBooking) });
});

export const POST = withRequestLogging(async (request) => {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = parseCreateBookingBody(bodyResult.body);
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues);
  }

  const result = await createBooking(parsed.value, new Date());
  if (!result.ok) {
    if (result.reason === 'event-type-not-found') {
      return jsonError('NOT_FOUND', 404, 'Тип события не найден');
    }
    if (result.reason === 'slot-in-past') {
      return jsonError('SLOT_IN_PAST', 409, 'Слот уже начался или прошёл');
    }
    // Гость выбирает из вычисляемых слотов: этот интервал пересекается
    // с существующей встречей (любого типа) — понятное сообщение о конфликте
    return jsonError(
      'SLOT_ALREADY_BOOKED',
      409,
      'Время пересекается с существующей встречей — выберите другое',
    );
  }

  return NextResponse.json(serializeBooking(result.booking), { status: 201 });
});
