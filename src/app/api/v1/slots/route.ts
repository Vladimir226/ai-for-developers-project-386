import { NextResponse } from 'next/server';
import { createSlot, deleteSlot, listSlots, serializeSlot } from '@/domain/availability/slots';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseCreateSlotBody, parseSlotQuery } from '@/lib/validation/slot';

// Route Handlers слотов (ADR-001): формы запросов/ответов — из TypeSpec-
// контракта #12 (ADR-010), конверт ошибок — ADR-005. Бизнес-правила — в
// доменном модуле availability, здесь только HTTP-связка.
// Некорректный JSON тела отвечает 422 VALIDATION_ERROR (не 400 из ADR-005):
// контракт #12 описывает только 422 — компромисс зафиксирован в PR/issue #4.

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async (request) => {
  const url = new URL(request.url);
  const parsed = parseSlotQuery(
    {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      view: url.searchParams.get('view') ?? undefined,
    },
    new Date(),
  );

  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидные параметры запроса', parsed.issues);
  }

  const slots = await listSlots(parsed.value, new Date());
  return NextResponse.json({ slots: slots.map(serializeSlot) });
});

export const POST = withRequestLogging(async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', [
      { field: 'body', message: 'ожидается корректный JSON' },
    ]);
  }

  const parsed = parseCreateSlotBody(body, new Date());
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues);
  }

  const result = await createSlot(parsed.value);
  if (!result.ok) {
    return jsonError('SLOT_OVERLAP', 409, 'Интервал пересекается с опубликованным слотом');
  }

  return NextResponse.json(serializeSlot(result.slot), { status: 201 });
});
