#!/usr/bin/env node
// Поднимает собранное приложение для e2e-прогона (тикет #9, шов 2) тем же
// путём, что и прод-контейнер (docker-entrypoint.sh, ADR-007): standalone
// server.js + статика, честный `prisma migrate deploy`. Каталог БД
// детерминирован (e2e/paths.ts) и пересоздаётся здесь — прогон всегда
// начинается с чистой базы; после тестов его убирает e2e/global-teardown.ts
// (Playwright гасит webServer жёстким SIGKILL, exit-обработчикам веры нет).
// WAL и busy_timeout приложение применяет само при первом обращении к БД
// (src/lib/db/prisma.ts).

import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const port = process.env.PORT ?? '3100';
const appTz = process.env.APP_TZ ?? 'Europe/Moscow';
const standaloneDir = path.join('.next', 'standalone');

// Предохранитель: только временная БД прогона — dev-data/app.db и файл в
// volume /data недоступны даже при ручном запуске скрипта мимо конфига
const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl.startsWith('file:') || !databaseUrl.includes('bac-e2e-')) {
  console.error(
    'e2e-server: нужен DATABASE_URL временной БД прогона — его задаёт playwright.config.ts',
  );
  process.exit(1);
}

// Чистый лист: остатки убитого прогона не должны влиять на этот прогон
const dbFile = databaseUrl.slice('file:'.length).split('?')[0];
const dbDir = path.dirname(dbFile);
await rm(dbDir, { recursive: true, force: true });
await mkdir(dbDir, { recursive: true });

const migrate = spawnSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});
if (migrate.status !== 0) {
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

// Простой проброс жизненного цикла: убили нас — уходит и сервер; жалеть
// процессы не нужно, уборкой данных занимается globalTeardown раннера
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}

await new Promise((resolve) => server.on('exit', resolve));
