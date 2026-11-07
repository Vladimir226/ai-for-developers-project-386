import type { PrismaClient } from '@prisma/client';

// Прагмы SQLite-соединения (ADR-002 + аддендум #3).
//
// journal_mode = WAL — постоянное свойство файла БД: достаточно применить
// один раз, режим переживает любые переподключения.
//
// busy_timeout — свойство КАЖДОГО соединения (по умолчанию 0): без него
// конкурентные записи из #6 будут ловить SQLITE_BUSY вместо честного
// ожидания блокировки. Применяется на соединении клиента приложения.

export const BUSY_TIMEOUT_MS = 5000;

export interface ConnectionPragmas {
  journalMode: string;
  busyTimeoutMs: number;
}

/**
 * Включает WAL и busy_timeout на соединении переданного клиента
 * и проверяет результат чтением pragma на том же соединении.
 * Идемпотентен.
 */
export async function applyConnectionPragmas(db: PrismaClient): Promise<ConnectionPragmas> {
  await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await db.$queryRawUnsafe(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

  const journalRows = await db.$queryRawUnsafe<{ journal_mode?: unknown }[]>('PRAGMA journal_mode');
  const timeoutRows = await db.$queryRawUnsafe<{ timeout?: unknown }[]>('PRAGMA busy_timeout');

  const journalMode = String(journalRows[0]?.journal_mode ?? '');
  const busyTimeoutMs = Number(timeoutRows[0]?.timeout ?? NaN);

  if (journalMode !== 'wal') {
    throw new Error(`SQLite journal_mode не применился: получено «${journalMode}», ожидался «wal»`);
  }
  if (busyTimeoutMs !== BUSY_TIMEOUT_MS) {
    throw new Error(
      `SQLite busy_timeout не применился: получено ${busyTimeoutMs}, ожидалось ${BUSY_TIMEOUT_MS}`,
    );
  }

  return { journalMode, busyTimeoutMs };
}
