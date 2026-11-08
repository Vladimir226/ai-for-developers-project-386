# Agent instructions

## Команды

```bash
npm install      # зависимости (postinstall сам выполнит prisma generate); Node 22 — из .nvmrc
npm run dev      # запуск: http://localhost:3000 (Next.js — бекенд и фронтенд вместе)
npm run check    # все проверки: lint + prettier + юнит-тесты + e2e на настоящем сервере; CI гоняет то же самое (make check)
npm test         # только тесты (vitest)
npm run test:e2e # браузерные тесты Playwright на настоящем сервере (сборка и старт — сама команда)
npm run lint     # только линтеры: eslint + tsc --noEmit + redocly + drift-check контракта
```

## Устройство проекта

- `src/app/` — Next.js App Router: страницы и API-роуты (`api/health`, `api/v1/slots`)
- `src/domain/` — доменная логика без HTTP и БД; `src/lib/` — инфраструктура: Prisma, валидация, SDK-клиент, логирование
- `contract/` — TypeSpec-контракт API, источник истины; `npm run contract:gen` генерирует `src/generated/` (коммитится, руками не править — расхождение ловит drift-check в CI)
- `prisma/` — схема и миграции (SQLite + WAL)
- CI: наш `.github/workflows/check.yml` вызывает `make check`; `hexlet-check.yml` — автогенерированный Хекслетом, не трогать

Правила, которые из кода не читаются: сервер — источник истины, UI ходит через SDK и `router.refresh()` (ADR-004); время храним и передаём в UTC, отображаем в `APP_TZ` (ADR-009); один Docker-образ, БД — файл в volume `/data` (ADR-007).

## Коммиты

Формат — Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, скоуп по вкусу — `feat(slots): …`. Коммит реализации ссылается на закрываемый тикет: `feat: запись на свободный слот (#12)`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Vladimir226/ai-for-developers-project-386) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Ticket workflow

Working a ticket (branch → TDD → PR → review → merge): environment checks at start, probe-first, pinning tests, merge modes. See `docs/agents/process.md`.
