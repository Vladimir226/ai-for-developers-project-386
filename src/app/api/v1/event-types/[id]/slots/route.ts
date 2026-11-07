import { NextResponse } from 'next/server';
import { listFreeSlots, serializeSlot } from '@/domain/availability/slots';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseSlotQuery } from '@/lib/validation/slot';

// GET вычисляемых свободных слотов типа (ADR-0011): генератор × рабочие часы
// × шаг = длительности (D2/D3), минус наложение с активными бронями (D12).
// `from`/`to` опциональны; дефолт [now; now + 14 дней] — период запроса с
// запасом накрывает окно записи (14 настенных дат с сегодняшней, D6):
// лишний хвост обрезает календарь публичной страницы (#34/#35).

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRequestLogging<RouteContext>(async (request, { params }) => {
  const { id } = await params;

  const url = new URL(request.url);
  const parsed = parseSlotQuery(
    {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    },
    new Date(),
  );
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидные параметры запроса', parsed.issues);
  }

  const result = await listFreeSlots(id, parsed.value);
  if (!result.ok) {
    return jsonError('NOT_FOUND', 404, 'Тип события не найден');
  }

  return NextResponse.json({ slots: result.slots.map(serializeSlot) });
});
