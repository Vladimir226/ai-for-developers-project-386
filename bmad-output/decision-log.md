# Decision Log

> Однострочные сводки всех ADR. Полные записи — в `architecture.md` §3.
> Новый ADR добавляется строкой сюда + полным блоком в architecture.md.

| ADR | Date | Decision (one line) | Status |
|-----|------|---------------------|--------|
| ADR-001 | 2026-11-07 | API — REST + JSON с префиксом `/api/v1`; ресурсы во множественном числе; без GraphQL | Accepted |
| ADR-002 | 2026-11-07 | СУБД — SQLite (WAL) через Prisma; файл БД в volume `/data`; изменения схемы только миграциями | Accepted |
| ADR-003 | 2026-11-07 | Без AuthN/AuthZ (PRD); single-owner; `/admin` публичен; пересмотр при публикации | Accepted |
| ADR-004 | 2026-11-07 | State — server-authoritative: чтение и мутации UI — только через сгенерированный SDK (self-fetch в RSC) + `router.refresh()`; без клиентского стора *(поправлен ADR-010)* | Accepted |
| ADR-005 | 2026-11-07 | Ошибки — JSON-конверт `error.code/message/details`; 400/404/409/422/500; стабильные SCREAMING_SNAKE_CASE коды; Zod-схемы генерируются из контракта *(поправлен ADR-010)* | Accepted |
| ADR-006 | 2026-11-07 | Naming: URL kebab-case, JSON camelCase, БД snake_case (`@map`), TS PascalCase/camelCase; код — англ., UI — рус. | Accepted |
| ADR-007 | 2026-11-07 | Один multi-stage Docker-образ (standalone, non-root, `/data`, HEALTHCHECK); Makefile `install/test/lint` для hexlet-check CI | Accepted |
| ADR-008 | 2026-11-07 | Слоты — конкретные дискретные интервалы (1 интервал = 1 звонок); антидубль — UNIQUE `slot_id`; отмена = DELETE | Accepted |
| ADR-009 | 2026-11-07 | Время: хранение/передача UTC ISO-8601; отображение в `APP_TZ` (default Europe/Moscow) на сервере | Accepted |
| ADR-010 | 2026-11-07 | Контракт-фёрст: TypeSpec → OpenAPI → SDK (openapi-typescript/openapi-fetch) + Zod (openapi-zod-client); `view=free\|all` в GET slots; сервер по контракту, drift-check в `make lint` | Accepted |
