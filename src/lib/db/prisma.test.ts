import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// getDb — точка доступа к Prisma-клиенту приложения (#4/#6 будут брать БД
// отсюда). Синглтон применяет прагмы соединения один раз при первом создании
// и создаёт недостающие каталоги файла БД (локальная разработка).

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  const fs = await import('node:fs/promises');
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

async function freshGetDb() {
  vi.resetModules();
  const dbModule = await import('./prisma');
  return dbModule.getDb;
}

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bac-prisma-'));
  tmpDirs.push(dir);
  return dir;
}

describe('getDb', () => {
  it('создаёт клиент с применёнными прагмами (WAL)', async () => {
    const dir = await tmpDir();
    vi.stubEnv('DATABASE_URL', `file:${path.join(dir, 'nested', 'app.db')}`);

    const getDb = await freshGetDb();
    const db = await getDb();
    const rows = await db.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');

    expect(rows[0]?.journal_mode).toBe('wal');
  });

  it('один и тот же инстанс на повторные вызовы', async () => {
    const dir = await tmpDir();
    vi.stubEnv('DATABASE_URL', `file:${path.join(dir, 'app.db')}`);

    const getDb = await freshGetDb();
    const [first, second] = await Promise.all([getDb(), getDb()]);

    expect(first).toBe(second);
    await first.$disconnect();
  });

  it('создаёт недостающий каталог файла БД', async () => {
    const dir = await tmpDir();
    const dbPath = path.join(dir, 'deep', 'nested', 'app.db');
    vi.stubEnv('DATABASE_URL', `file:${dbPath}`);

    const getDb = await freshGetDb();
    const db = await getDb();
    await db.$disconnect();

    const fs = await import('node:fs/promises');
    await expect(fs.access(dbPath)).resolves.toBeUndefined();
  });

  it('дефолт DATABASE_URL — file:/data/app.db (ADR-002: volume /data)', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    const dbModule = await import('./prisma');

    // без env клиент не создаём (вне контейнера /data недоступен) —
    // проверяем только значение по умолчанию
    expect(dbModule.defaultDatabaseUrl()).toBe('file:/data/app.db');
  });
});
