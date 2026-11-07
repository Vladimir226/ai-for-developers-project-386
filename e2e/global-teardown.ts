import { rm } from 'node:fs/promises';
import { e2eDbDir } from './paths';

// Уборка временной БД прогона (тикет #9): Playwright гасит webServer жёстким
// SIGKILL по группе процессов, exit-обработчику сервера доверять нельзя —
// каталог удаляет раннер после тестов. Путь детерминирован (e2e/paths.ts),
// поэтому здесь он просто вычисляется заново, без env-обмена.

export default async function globalTeardown(): Promise<void> {
  await rm(e2eDbDir(), { recursive: true, force: true });
}
