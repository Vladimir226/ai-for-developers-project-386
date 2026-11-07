import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BUSY_TIMEOUT_MS, applyConnectionPragmas } from './connection';

// Pragma-тесты бьют в настоящий SQLite-файл во временной папке (ADR-002):
// journal_mode — постоянное свойство файла, busy_timeout — свойство соединения,
// поэтому обе проверки идут через то же соединение, которое их применяло.

const clients: PrismaClient[] = [];

function makeClient(url: string): PrismaClient {
  const client = new PrismaClient({ datasources: { db: { url } } });
  clients.push(client);
  return client;
}

async function tmpDbUrl(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bac-connection-'));
  return `file:${path.join(dir, 'app.db')}`;
}

afterEach(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  clients.length = 0;
});

describe('applyConnectionPragmas', () => {
  it('включает WAL и busy_timeout на соединении', async () => {
    const db = makeClient(await tmpDbUrl());

    const result = await applyConnectionPragmas(db);

    expect(result.journalMode).toBe('wal');
    expect(result.busyTimeoutMs).toBe(BUSY_TIMEOUT_MS);
  });

  it('WAL — постоянное свойство файла: переживает новое соединение', async () => {
    const url = await tmpDbUrl();
    const first = makeClient(url);
    await applyConnectionPragmas(first);
    await first.$disconnect();

    const second = makeClient(url);
    const rows = await second.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');

    expect(rows[0]?.journal_mode).toBe('wal');
  });

  it('идемпотентен: повторное применение не ломает соединение', async () => {
    const db = makeClient(await tmpDbUrl());

    await applyConnectionPragmas(db);
    const result = await applyConnectionPragmas(db);

    expect(result.journalMode).toBe('wal');
  });

  it('busy_timeout держится на соединении под конкурентной нагрузкой', async () => {
    // Пиннинг допущения, на котором стоит дизайн: Prisma-клиент держит
    // соединение, на котором мы применили прагму, и не подменяет его
    // новым (без busy_timeout) в конкурентных запросах (#6).
    const db = makeClient(await tmpDbUrl());
    await applyConnectionPragmas(db);

    await Promise.all(Array.from({ length: 20 }, () => db.$queryRawUnsafe('SELECT 1')));
    const rows = await db.$queryRawUnsafe<{ timeout?: unknown }[]>('PRAGMA busy_timeout');

    expect(Number(rows[0]?.timeout)).toBe(BUSY_TIMEOUT_MS);
  });
});
