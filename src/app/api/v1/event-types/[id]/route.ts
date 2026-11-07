import { NextResponse } from 'next/server';
import {
  deleteEventType,
  serializeEventType,
  updateEventType,
} from '@/domain/event-types/event-types';
import { readJsonBody } from '@/lib/http/json-body';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseEventTypeDraft } from '@/lib/validation/event-type';

// PUT/DELETE типа события (владелец): полная замена полей; удаление —
// каскадное вместе с бронями (D4, FK ON DELETE CASCADE). 422 на битый JSON —
// компромисс из PR #4 (в контракте только 422).

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const PUT = withRequestLogging<RouteContext>(async (request, { params }) => {
  const { id } = await params;

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = parseEventTypeDraft(bodyResult.body);
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues);
  }

  const updated = await updateEventType(id, parsed.value);
  if (!updated) {
    return jsonError('NOT_FOUND', 404, 'Тип события не найден');
  }

  return NextResponse.json(serializeEventType(updated));
});

export const DELETE = withRequestLogging<RouteContext>(async (_request, { params }) => {
  const { id } = await params;

  const deleted = await deleteEventType(id);
  if (!deleted) {
    return jsonError('NOT_FOUND', 404, 'Тип события не найден');
  }

  return new NextResponse(null, { status: 204 });
});
