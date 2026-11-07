#!/usr/bin/env node
// Поднимает собранное приложение для e2e-прогона (тикет #9, шов 2) тем же
// путём, что и прод-контейнер (docker-entrypoint.sh, ADR-007): standalone
// server.js + статика, свежая временная SQLite-БД, честный
// `prisma migrate deploy`. Каталог БД живёт ровно столько, сколько сервер:
// создаётся до миграций и удаляется при завершении, поэтому e2e никогда не
// касается dev-data/app.db и не чистит чужие данные. WAL и busy_timeout
// приложение применяет само при первом обращении к БД (src/lib/db/prisma.ts).

import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = process.env.PORT ?? '3100';
const appTz = process.env.APP_TZ ?? 'Europe/Moscow';
const standaloneDir = path.join('.next', 'standalone');

const dir = await mkdtemp(path.join(tmpdir(), 'bac-e2e-'));
const databaseUrl = `file:${path.join(dir, 'e2e.db')}`;

const migrate = spawnSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});
if (migrate.status !== 0) {
  await rm(dir, { recursive: true, force: true });
  process.exit(migrate.status ?? 1);
}

// standalone-выход не содержит статики (Dockerfile переносит её отдельной
// командой) — без неё страницы отдаются без CSS, а e2e проверяет адаптивность
await cp(path.join('.next', 'static'), path.join(standaloneDir, '.next', 'static'), {
  recursive: true,
});

const server = spawn('node', ['server.js'], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_TZ: appTz,
    PORT: port,
    HOSTNAME: '127.0.0.1',
  },
  stdio: 'inherit',
});

// Playwright гасит webServer сигналом: пересылаем его серверу, а уборку
// временного каталога делает обработчик его exit — единственная точка выхода
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}

server.on('exit', async (code) => {
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
