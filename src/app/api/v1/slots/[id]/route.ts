import { NextResponse } from 'next/server';
import { deleteSlot } from '@/domain/availability/slots';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';

// DELETE /api/v1/slots/{id} (ADR-001, ADR-008): удалить интервал; связанная
// бронь удаляется каскадом (сущность Booking приезжает в #6).

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withRequestLogging<RouteContext>(async (_request, { params }) => {
  const { id } = await params;

  const deleted = await deleteSlot(id);
  if (!deleted) {
    return jsonError('NOT_FOUND', 404, 'Слот не найден');
  }

  return new NextResponse(null, { status: 204 });
});
