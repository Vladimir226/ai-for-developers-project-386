// APP_TZ (ADR-009): зона отображения. Прод-контейнер и .env.example задают
// Europe/Moscow; дефолт тот же — зона показа это продукт-решение (русский UI),
// а не локаль сервера. Читается при каждом вызове, чтобы тесты могли подменять env.

const DEFAULT_APP_TZ = 'Europe/Moscow';

export function getAppTz(): string {
  return process.env.APP_TZ?.trim() || DEFAULT_APP_TZ;
}
