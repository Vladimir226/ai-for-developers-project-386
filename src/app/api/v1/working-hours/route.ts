import { NextResponse } from 'next/server';
import {
  getWorkingHours,
  putWorkingHours,
  serializeWorkingHoursDay,
} from '@/domain/availability/working-hours';
import { readJsonBody } from '@/lib/http/json-body';
import { jsonError } from '@/lib/http/json-error';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseWorkingHoursBody } from '@/lib/validation/working-hours';

// Route Handlers рабочих часов (D3): GET — текущая неделя (пустая таблица →
// дефолт Пн–Пт 09:00–18:00 в памяти), PUT — полная замена 7 дней (владелец).
// 422 на битый JSON — компромисс из PR #4 (в контракте только 422).

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async () => {
  const days = await getWorkingHours();
  return NextResponse.json({ days: days.map(serializeWorkingHoursDay) });
});

export const PUT = withRequestLogging(async (request) => {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = parseWorkingHoursBody(bodyResult.body);
  if (!parsed.ok) {
    return jsonError('VALIDATION_ERROR', 422, 'Невалидное тело запроса', parsed.issues);
  }

  const days = await putWorkingHours(parsed.value);
  return NextResponse.json({ days: days.map(serializeWorkingHoursDay) });
});
