import { NextResponse } from 'next/server';
import { withRequestLogging } from '@/lib/http/with-request-logging';

// Инфраструктурный эндпоинт здоровья (ADR-002/NFR-008): без версии, вне
// TypeSpec-контракта (ADR-010), не входит в доменный API /api/v1.
export const GET = withRequestLogging(async () => NextResponse.json({ status: 'ok' }));
