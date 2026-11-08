# Decision Log

> Однострочные сводки всех ADR. Полные записи — файлы `docs/adr/000N-slug.md`
> (с 2026-11-07, решение D11 карты #28; раньше — в `architecture.md` §3).
> Новый ADR добавляется файлом в `docs/adr/` + строкой сюда + строкой в
> `docs/adr/README.md`.

| ADR     | Date       | Decision (one line)                                                                                                                                                                        | Status                 |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| ADR-001 | 2026-11-07 | API — REST + JSON с префиксом `/api/v1`; ресурсы во множественном числе; без GraphQL                                                                                                       | Accepted               |
| ADR-002 | 2026-11-07 | СУБД — SQLite (WAL) через Prisma; файл БД в volume `/data`; изменения схемы только миграциями                                                                                              | Accepted               |
| ADR-003 | 2026-11-07 | Без AuthN/AuthZ (PRD); single-owner; `/admin` публичен; пересмотр при публикации                                                                                                           | Accepted               |
| ADR-004 | 2026-11-07 | State — server-authoritative: чтение и мутации UI — только через сгенерированный SDK (self-fetch в RSC) + `router.refresh()`; без клиентского стора _(поправлен ADR-010)_                  | Accepted               |
| ADR-005 | 2026-11-07 | Ошибки — JSON-конверт `error.code/message/details`; 400/404/409/422/500; стабильные SCREAMING_SNAKE_CASE коды; Zod-схемы генерируются из контракта _(поправлен ADR-010)_                   | Accepted               |
| ADR-006 | 2026-11-07 | Naming: URL kebab-case, JSON camelCase, БД snake_case (`@map`), TS PascalCase/camelCase; код — англ., UI — рус.                                                                            | Accepted               |
| ADR-007 | 2026-11-07 | Один multi-stage Docker-образ (standalone, non-root, `/data`, HEALTHCHECK); Makefile `install/test/lint` для hexlet-check CI                                                               | Accepted               |
| ADR-008 | 2026-11-07 | Слоты — конкретные дискретные интервалы (1 интервал = 1 звонок); антидубль — UNIQUE `slot_id`; отмена = DELETE                                                                             | Superseded by ADR-0011 |
| ADR-009 | 2026-11-07 | Время: хранение/передача UTC ISO-8601; отображение в `APP_TZ` (default Europe/Moscow) на сервере _(поправлен аддендумом #5: ввод настенного времени — `wallTimeToUtcIso` на клиенте)_      | Accepted               |
| ADR-010 | 2026-11-07 | Контракт-фёрст: TypeSpec → OpenAPI → SDK (openapi-typescript/openapi-fetch) + Zod (openapi-zod-client); `view=free\|all` в GET slots; сервер по контракту, drift-check в `make lint`       | Accepted               |
| ADR-011 | 2026-11-07 | Слоты вычисляются из типов событий × рабочие часы × окно 14 дней; бронь = тип + старт + контакты; занятость = наложение полуинтервалов между всеми типами; гонки — транзакция с предикатом | Accepted               |
| ADR-012 | 2026-11-08 | Публичная страница «Предстоящие записи» (/bookings): все предстоящие брони всех гостей, read-only, без auth (ADR-003); существующий `GET /bookings?upcoming`, без изменений контракта      | Accepted               |
