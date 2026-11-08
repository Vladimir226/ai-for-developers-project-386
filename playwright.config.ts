import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT, e2eDatabaseUrl } from './e2e/paths';

// E2e-прогон шва 2 (GLOSSARY): входит в единую команду проверок
// `npm run check` / `make check` и в CI check.yml с кэшем браузеров
// (карта #28/D7, тикет #38); hexlet-check CI остаётся в стороне — он гоняет
// свой smoke по собранному Docker-образу и наших npm-команд не запускает.
// Поднимается собранное приложение (`next build` делает test:e2e) на
// нестандартном порту из e2e/paths.ts; миграции и старт сервера — в
// scripts/e2e-server.mjs. Зона — APP_TZ (ADR-009): Europe/Moscow, как в
// прод-контейнере.
//
// Каталог БД (детерминированный путь из paths.ts) пересоздаёт серверный
// скрипт, убирает globalTeardown. Playwright гасит webServer жёстким SIGKILL
// по группе, поэтому exit-обработчикам сервера веры нет; мусор от убитых
// прогонов (Ctrl+C, kill -9) подметаем здесь — конфиг вычисляется в каждом
// процессе раннера, но уборка идемпотентна: порог в час не заденет каталог
// идущего прогона.

for (const name of readdirSync(tmpdir())) {
  if (!name.startsWith('bac-e2e-')) continue;
  const stale = path.join(tmpdir(), name);
  try {
    if (Date.now() - statSync(stale).mtimeMs > 60 * 60 * 1000) {
      rmSync(stale, { recursive: true, force: true });
    }
  } catch {
    // чужой каталог исчез или недоступен — не наше дело
  }
}

export default defineConfig({
  testDir: './e2e',
  // Одна общая БД на прогон: тесты сеют слоты на разных днях, параллельность
  // сделала бы календари и счётчики окон взаимными помехами
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list']],
  globalTeardown: './e2e/global-teardown',
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    timeout: 120_000,
    // каждый прогон — свежий сервер и чистая временная БД
    reuseExistingServer: false,
    env: {
      PORT: String(E2E_PORT),
      APP_TZ: 'Europe/Moscow',
      DATABASE_URL: e2eDatabaseUrl(),
    },
  },
});
