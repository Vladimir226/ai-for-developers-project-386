# ADR: журнал архитектурных решений

**Канонический источник —
[`bmad-output/architecture.md`](../../bmad-output/architecture.md) §3.**
Полные тексты ADR-001…010 живут там и **не** дублируются отдельными файлами —
этот каталог является указателем, а не копией (один источник истины).
Однострочные сводки —
[`bmad-output/decision-log.md`](../../bmad-output/decision-log.md).

## Текущие решения

| ADR | Решение (сводка) |
|-----|------------------|
| ADR-001 | REST + JSON API, префикс `/api/v1`; ресурсы во множественном числе |
| ADR-002 | SQLite (WAL) через Prisma; файл БД в volume `/data` |
| ADR-003 | Без аутентификации; single-owner модель |
| ADR-004 | Server-authoritative state; чтение и мутации UI — через SDK, `router.refresh()` *(поправлен ADR-010)* |
| ADR-005 | Конверт ошибок API; валидация — Zod-схемы из контракта *(поправлен ADR-010)* |
| ADR-006 | Конвенции именования: URL kebab-case, JSON camelCase, БД snake_case |
| ADR-007 | Один multi-stage Docker-образ (non-root, volume, HEALTHCHECK); Makefile для hexlet-check CI |
| ADR-008 | Дискретные слоты (1 интервал = 1 звонок); антидубль UNIQUE `slot_id`; отмена = DELETE |
| ADR-009 | Время: UTC в хранении и передаче; отображение в `APP_TZ` на сервере |
| ADR-010 | Контракт-фёрст: TypeSpec → OpenAPI → SDK + Zod; сервер реализуется по контракту |

## Как добавить новый ADR

1. Полный блок решения — в `bmad-output/architecture.md` §3 (по формату
   существующих ADR).
2. Строка — в `bmad-output/decision-log.md`.
3. Строка в таблице выше.

Отдельный файл на ADR здесь **не** создаётся — иначе появятся два источника,
которые разъедутся.
