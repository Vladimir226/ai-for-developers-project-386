import { NextResponse } from 'next/server';
import { createBooking, listBookings, serializeBooking } from '@/domain/bookings/bookings';
import { readJsonBody } from '@/lib/http/json-body';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseCreateBookingBody } from '@/lib/validation/booking';

// Route Handlers броней (ADR-001): формы запросов/ответов — из TypeSpec-
// контракта #12 (ADR-010), конверт ошибок — ADR-005. Бизнес-правила — в
// доменном модуле bookings, здесь только HTTP-связка.
// Некорректный JSON тела отвечает 422 VALIDATION_ERROR (не 400 из ADR-005):
// контракт #12 описывает только 422 — компромисс, зафиксированный в PR #4.

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async () => {
  const bookings = await listBookings();
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
    if (result.reason === 'slot-in-past') {
      return jsonError('SLOT_IN_PAST', 409, 'Слот уже начался или прошёл');
    }
    if (result.reason === 'slot-already-booked') {
      return jsonError('SLOT_ALREADY_BOOKED', 409, 'Слот уже забронирован');
    }
    return jsonError('NOT_FOUND', 404, 'Слот не найден');
  }

  return NextResponse.json(serializeBooking(result.booking), { status: 201 });
});
