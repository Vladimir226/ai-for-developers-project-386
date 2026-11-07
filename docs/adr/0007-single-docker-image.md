# Один Docker-образ: multi-stage, non-root, volume, healthcheck; Makefile для CI

**Status:** Accepted
**Drives:** NFR-001, NFR-008, NFR-009
**Date:** 2026-11-07 (перенесён из `bmad-output/architecture.md` §3, карта #28/D11)

**Context:** Главное ограничение задания — сборка в Docker-образ и запуск в
контейнере. Плюс ограничение репозитория: hexlet-check CI должен проходить,
Makefile-цели обязаны существовать и быть зелёными.

**Decision:**

- Один `Dockerfile` с multi-stage сборкой: `deps` → `builder` (prisma generate,
  next build) → `runner` на `node:22-alpine` с `output: "standalone"`.
- В runtime-образ не попадают dev-зависимости, исходники тестов и `.env`.
- Контейнер выполняется от непривилегированного пользователя `node` (NFR-007).
- Файл БД — `/data/app.db`; каталог `/data` монтируется volume
  (`docker run -p 3000:3000 -v book-a-call-data:/data …`).
- `HEALTHCHECK` в образе бьёт в `/api/health`.
- Порт контейнера — `3000`; конфигурация — только через переменные окружения
  (`APP_TZ`, `DATABASE_URL` со значением по умолчанию
  `file:/data/app.db`); секретов в образе нет.
- В корне репозитория — `Makefile` с целями `install`, `test`, `lint`
  (делегируют в npm-скрипты) для hexlet-check CI; workflow-файл Хекслета не
  трогаем.

**Consequences — LOCKED for all stories:**

- Easier: доставка = `docker build` + `docker run`; CI не требует БД.
- Accepted cost: standalone-выход Next.js требует аккуратного копирования
  `.next/standalone` + `.next/static` + `public`. Mitigation: сборка проверяется
  локально на каждой истории, затрагивающей Dockerfile.

**Alternatives:** docker-compose с Postgres (нарушает single-image смысл
задания); single-stage образ (размер и секреты); запуск от root (нарушает
NFR-007).

**Revisit when:** появится требование отдельного БД-сервиса или CDN-статика.
