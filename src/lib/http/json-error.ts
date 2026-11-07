import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { schemas } from '@/generated/zod';
import type { FieldIssue } from '@/lib/validation/slot';

// Конверт ошибок API (ADR-005): {"error": {"code", "message", "details"?}}.
// Единственный способ вернуть ошибку из Route Handlers — коды берутся из
// контракта (сгенерированный enum ErrorCode, ADR-010), сообщения — на русском.

export type ApiErrorCode = z.infer<typeof schemas.ErrorCode>;

export function jsonError(
  code: ApiErrorCode,
  status: 404 | 409 | 422,
  message: string,
  details?: FieldIssue[],
): Response {
  const body = details ? { error: { code, message, details } } : { error: { code, message } };
  return NextResponse.json(body, { status });
}
