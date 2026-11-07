import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, vi } from 'vitest';

// Свежая временная SQLite-БД для integration-тестов (NFR-003): миграции
// применяются честным `prisma migrate deploy` — тем же путём, что и при
// старте контейнера (docker-entrypoint.sh, ADR-007). DATABASE_URL
// подменяется до первого обращения routes к getDb() (env читается лениво).

/**
 * Регистрирует beforeAll/afterAll: временный каталог с файлом БД, применённые
 * миграции и подменённый DATABASE_URL. Отключает клиент и удаляет каталог.
 */
export function setupTestDatabase(): void {
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bac-integration-'));
    const url = `file:${path.join(dir, 'test.db')}`;
    execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    vi.stubEnv('DATABASE_URL', url);
  });

  afterAll(async () => {
    const { getDb } = await import('@/lib/db/prisma');
    const db = await getDb();
    await db.$disconnect();
    vi.unstubAllEnvs();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
}

/** Чистит таблицы новой модели между тестами (setup, не проверка). */
export async function clearTables(): Promise<void> {
  const { getDb } = await import('@/lib/db/prisma');
  const db = await getDb();
  await db.booking.deleteMany();
  await db.eventType.deleteMany();
  await db.workingHours.deleteMany();
}
