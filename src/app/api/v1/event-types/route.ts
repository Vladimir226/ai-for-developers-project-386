import { NextResponse } from 'next/server';
import {
  createEventType,
  listEventTypes,
  serializeEventType,
} from '@/domain/event-types/event-types';
import { readJsonBody } from '@/lib/http/json-body';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseEventTypeDraft } from '@/lib/validation/event-type';

// Route Handlers типов событий (ADR-001): формы запросов/ответов — контракт
// v2 (#32, ADR-010), конверт ошибок — ADR-005. GET — публичный список для
// страницы видов брони и панели владельца, POST — владелец (без auth,
// ADR-0003). Бизнес-правила — в доменном модуле event-types, здесь только
// HTTP-связка. Некорректный JSON тела отвечает 422 VALIDATION_ERROR
// (не 400 из ADR-005): контракт описывает только 422 — компромисс,
// зафиксированный в PR #4.

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async () => {
  const eventTypes = await listEventTypes();
  return NextResponse.json({ eventTypes: eventTypes.map(serializeEventType) });
});

export const POST = withRequestLogging(async (request) => {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = parseEventTypeDraft(bodyResult.body);
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues);
  }

  const eventType = await createEventType(parsed.value);
  return NextResponse.json(serializeEventType(eventType), { status: 201 });
});
