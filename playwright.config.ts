import { defineConfig, devices } from '@playwright/test';

// E2e-прогон шва 2 (GLOSSARY): отдельная команда `npm run test:e2e`, не входит
// в `make check` / hexlet-check CI (тикет #9). Поднимается собранное
// приложение (`next build` делает test:e2e) на нестандартном порту 3100;
// временная БД и миграции — в scripts/e2e-server.mjs. Виталист на APP_TZ
// (ADR-009): Europe/Moscow — как в прод-контейнере.

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  // Одна общая БД на прогон: тесты сеют слоты на разных днях, параллельность
  // сделала бы календари и счётчики окон взаимными помехами
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:server',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120_000,
    // каждый прогон — свежий сервер и чистая временная БД
    reuseExistingServer: false,
    env: { PORT: String(PORT), APP_TZ: 'Europe/Moscow' },
  },
});
