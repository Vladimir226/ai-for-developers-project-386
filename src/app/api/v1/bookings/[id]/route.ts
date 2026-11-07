import { NextResponse } from 'next/server';
import { deleteBooking } from '@/domain/bookings/bookings';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';

// DELETE /api/v1/bookings/{id} (ADR-001, ADR-0011): отмена брони — DELETE
// строки; время снова становится свободным для всех типов (US-07).

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withRequestLogging<RouteContext>(async (_request, { params }) => {
  const { id } = await params;

  const deleted = await deleteBooking(id);
  if (!deleted) {
    return jsonError('NOT_FOUND', 404, 'Бронь не найдена');
  }

  return new NextResponse(null, { status: 204 });
});
