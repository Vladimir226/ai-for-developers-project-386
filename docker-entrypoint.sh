#!/bin/sh
# Точка входа контейнера (ADR-007): миграции применяются до старта сервера,
# и WAL включается на файле БД до первого запроса (journal_mode — постоянное
# свойство файла SQLite, ADR-002).
# busy_timeout — свойство соединения: его применяет src/lib/db/connection.ts
# на соединении самого приложения (getDb), здесь он был бы бесполезен.
set -e

# Каталог БД может быть примонтированным volume (docker -v, диск Render), и
# права на него задаёт платформа — проверяем запись до миграций, чтобы падать
# с понятной причиной, а не EACCES из глубины Prisma. Относительный путь
# Prisma резолвит от prisma/ — считаем так же.
DB_PATH="${DATABASE_URL#file:}"
case "$DB_PATH" in /*) ;; *) DB_PATH="prisma/$DB_PATH" ;; esac
DATA_DIR=$(dirname "$DB_PATH")
mkdir -p "$DATA_DIR" 2>/dev/null || true
if ! touch "$DATA_DIR/.write-check" 2>/dev/null; then
  echo "[entrypoint] не могу писать в $DATA_DIR (uid=$(id -u), user=$(id -un)):" >&2
  echo "  проверьте права volume/диска на этот каталог (см. README, «Деплой»)" >&2
  exit 1
fi
rm -f "$DATA_DIR/.write-check"

echo "[entrypoint] применяю prisma-миграции…" >&2
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] включаю WAL-режим SQLite…" >&2
node <<'EOF'
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.$queryRawUnsafe('PRAGMA journal_mode = WAL')
  .then((rows) => {
    // PRAGMA не бросает ошибку при неудаче — возвращает фактический режим,
    // поэтому сверяем сами и падаем ярко, а не живём с невыключенным WAL
    const mode = rows[0]?.journal_mode;
    if (mode !== 'wal') {
      throw new Error(`SQLite journal_mode = ${mode}, ожидался wal`);
    }
    console.log('[entrypoint] SQLite journal_mode = wal');
    return db.$disconnect();
  })
  .catch((error) => {
    console.error('[entrypoint] не удалось включить WAL:', error);
    process.exit(1);
  });
EOF

echo "[entrypoint] запускаю book-a-call на порту ${PORT:-3000}" >&2
exec node server.js
