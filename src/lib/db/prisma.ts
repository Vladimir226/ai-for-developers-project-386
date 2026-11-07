import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { applyConnectionPragmas } from './connection';

// Единственная точка создания Prisma-клиента приложения (ADR-002).
// Прагмы соединения (WAL + busy_timeout) применяются один раз при первом
// обращении — все будущие потребители БД (#4 слоты, #6 брони) берут клиент
// отсюда, а не создают свой. Eager-включение WAL на файле при старте
// контейнера делает docker-entrypoint.sh.

const DEFAULT_URL = 'file:/data/app.db';

let dbPromise: Promise<PrismaClient> | undefined;

export function defaultDatabaseUrl(): string {
  return DEFAULT_URL;
}

function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_URL;
}

/**
 * Создаёт недостающие каталоги для файла SQLite-БД.
 * SQLite не умеет создавать родительские каталоги сам; в контейнере
 * /data существует (Dockerfile), локально каталог может отсутствовать.
 */
async function ensureDatabaseDir(url: string): Promise<void> {
  if (!url.startsWith('file:')) return;
  const filePath = url.slice('file:'.length).split('?')[0].trim();
  if (!filePath || filePath.includes(':memory:')) return;

  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
}

/**
 * Готовый к работе Prisma-клиент (синглтон): каталог БД создан,
 * прагмы соединения применены и проверены.
 */
export function getDb(): Promise<PrismaClient> {
  dbPromise ??= (async () => {
    await ensureDatabaseDir(databaseUrl());
    const db = new PrismaClient();
    await applyConnectionPragmas(db);
    return db;
  })();
  return dbPromise;
}
