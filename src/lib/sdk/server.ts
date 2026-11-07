import { headers } from 'next/headers';
import { createApiClient } from './client';

// Self-fetch RSC (ADR-004, ADR-010): UI-слой читает только собственный API —
// включая серверный рендер страниц. Базовый URL восстанавливается из заголовков
// запроса, чтобы работать и в dev, и за прокси; запасной вариант — собственный
// порт процесса (задан docker-entrypoint/next start).

export async function createServerApiClient(): Promise<ReturnType<typeof createApiClient>> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http';
  const baseUrl = host ? `${proto}://${host}` : `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return createApiClient({ baseUrl });
}
