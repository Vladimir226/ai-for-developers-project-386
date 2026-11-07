import createClient from 'openapi-fetch';
import type { paths } from '@/generated/schema';

// SDK (ADR-010, ADR-004): единственный способ UI-слоя обращаться к API.
// Типы paths сгенерированы из TypeSpec-контракта (src/generated/schema.d.ts) —
// вызов несуществующего пути или неверные параметры не скомпилируются.

export type ApiClient = ReturnType<typeof createClient<paths>>;

export function createApiClient(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): ApiClient {
  return createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
}
