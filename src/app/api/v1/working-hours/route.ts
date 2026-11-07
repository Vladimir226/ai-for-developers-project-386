import { NextResponse } from 'next/server';
import {
  getWorkingHours,
  putWorkingHours,
  serializeWorkingHoursDay,
} from '@/domain/availability/working-hours';
import { parseBodyOr } from '@/lib/http/json-body';
import { withRequestLogging } from '@/lib/http/with-request-logging';
import { parseWorkingHoursBody } from '@/lib/validation/working-hours';

// Route Handlers рабочих часов (D3): GET — текущая неделя (пустая таблица →
// дефолт Пн–Пт 09:00–18:00 в памяти), PUT — полная замена 7 дней (владелец).
// Битый JSON и невалидные поля — единый 422 VALIDATION_ERROR (parseBodyOr;
// аддендум ADR-0005 от 2026-11-07).

export const dynamic = 'force-dynamic';

export const GET = withRequestLogging(async () => {
  const days = await getWorkingHours();
  return NextResponse.json({ days: days.map(serializeWorkingHoursDay) });
});

export const PUT = withRequestLogging(async (request) => {
  const parsed = await parseBodyOr(request, parseWorkingHoursBody);
  if (!parsed.ok) {
    return parsed.response;
  }

  const days = await putWorkingHours(parsed.value);
  return NextResponse.json({ days: days.map(serializeWorkingHoursDay) });
});
