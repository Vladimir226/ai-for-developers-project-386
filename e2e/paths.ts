import { tmpdir } from 'node:os';
import path from 'node:path';

// Общие пути прогона (тикет #9): каталог БД детерминирован портом, поэтому
// playwright.config.ts, e2e/global-teardown.ts и scripts/e2e-server.mjs
// сходятся на одном пути без обмена состоянием между процессами playwright
// (конфиг вычисляется в нескольких процессах — mkdtemp там небезопасен).

export const E2E_PORT = 3100;

/**
 * Каталог временной БД прогона. Один на порт: параллельные прогоны на одном
 * порту исключены (`reuseExistingServer: false` — второй упадёт на бинде).
 */
export function e2eDbDir(): string {
  return path.join(tmpdir(), `bac-e2e-${E2E_PORT}`);
}

/** DATABASE_URL прогона — файловая SQLite в каталоге e2eDbDir(). */
export function e2eDatabaseUrl(): string {
  return `file:${path.join(e2eDbDir(), 'e2e.db')}`;
}
