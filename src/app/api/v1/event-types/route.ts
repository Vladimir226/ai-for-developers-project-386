import { NextResponse } from 'next/server';
import {
  createEventType,
  listEventTypes,
  serializeEventType,
} from '@/domain/event-types/event-types';
import { parseBodyOr } from '@/lib/http/json-body';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseEventTypeDraft } from '@/lib/validation/event-type';

// Route Handlers типов событий (ADR-001): формы запросов/ответов — контракт
// v2 (#32, ADR-010), конверт ошибок — ADR-005. GET — публичный список для
// страницы видов брони и панели владельца, POST — владелец (без auth,
// ADR-0003). Бизнес-правила — в доменном модуле event-types, здесь только
// HTTP-связка. Битый JSON и невалидные поля — единый 422 VALIDATION_ERROR
// (parseBodyOr; компромисс PR #4, закреплён аддендумом ADR-0005).

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async () => {
  const eventTypes = await listEventTypes();
  return NextResponse.json({ eventTypes: eventTypes.map(serializeEventType) });
});

export const POST = withRequestLogging(async (request) => {
  const parsed = await parseBodyOr(request, parseEventTypeDraft);
  if (!parsed.ok) {
    return parsed.response;
  }

  const eventType = await createEventType(parsed.value);
  return NextResponse.json(serializeEventType(eventType), { status: 201 });
});
