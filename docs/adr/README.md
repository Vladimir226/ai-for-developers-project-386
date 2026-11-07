# ADR: журнал архитектурных решений

**Канонический источник — файлы этого каталога**: каждый ADR — отдельный
файл `000N-slug.md` (решение D11 карты #28). Формат —
[`.agents/skills/domain-modeling/ADR-FORMAT.md`](../../.agents/skills/domain-modeling/ADR-FORMAT.md):
заголовок-решение, статус, контекст; полные тексты — без искусственного
урезания. Однострочные сводки —
[`bmad-output/decision-log.md`](../../bmad-output/decision-log.md);
исторический архитектурный документ —
[`bmad-output/architecture.md`](../../bmad-output/architecture.md) §3
(индекс, при противоречии побеждают файлы здесь).

## Текущие решения

| ADR      | Решение (сводка)                                                                                                                                  | Статус                     | Файл                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| ADR-0001 | REST + JSON API, префикс `/api/v1`; ресурсы во множественном числе                                                                                | Accepted                   | [0001-rest-json-api.md](0001-rest-json-api.md)                                   |
| ADR-0002 | SQLite (WAL) через Prisma; файл БД в volume `/data`                                                                                               | Accepted                   | [0002-sqlite-wal-prisma.md](0002-sqlite-wal-prisma.md)                           |
| ADR-0003 | Без аутентификации; single-owner модель                                                                                                           | Accepted                   | [0003-single-owner-no-auth.md](0003-single-owner-no-auth.md)                     |
| ADR-0004 | Server-authoritative state; чтение и мутации UI — через SDK, `router.refresh()` _(поправлен ADR-0010)_                                            | Accepted (amended by 0010) | [0004-server-authoritative-state.md](0004-server-authoritative-state.md)         |
| ADR-0005 | Конверт ошибок API; валидация — Zod-схемы из контракта _(поправлен ADR-0010)_                                                                     | Accepted (amended by 0010) | [0005-api-error-envelope.md](0005-api-error-envelope.md)                         |
| ADR-0006 | Конвенции именования: URL kebab-case, JSON camelCase, БД snake_case                                                                               | Accepted                   | [0006-naming-conventions.md](0006-naming-conventions.md)                         |
| ADR-0007 | Один multi-stage Docker-образ (non-root, volume, HEALTHCHECK); Makefile для hexlet-check CI                                                       | Accepted                   | [0007-single-docker-image.md](0007-single-docker-image.md)                       |
| ADR-0008 | Дискретные слоты (1 интервал = 1 звонок); антидубль UNIQUE `slot_id`                                                                              | **Superseded by ADR-0011** | [0008-discrete-slots.md](0008-discrete-slots.md)                                 |
| ADR-0009 | Время: UTC в хранении и передаче; отображение в `APP_TZ` на сервере _(поправлен аддендумом #5: ввод настенного времени через `wallTimeToUtcIso`)_ | Accepted                   | [0009-utc-app-tz-time.md](0009-utc-app-tz-time.md)                               |
| ADR-0010 | Контракт-фёрст: TypeSpec → OpenAPI → SDK + Zod; сервер реализуется по контракту                                                                   | Accepted                   | [0010-contract-first-typespec.md](0010-contract-first-typespec.md)               |
| ADR-0011 | Вычисляемые слоты из типов событий и рабочих часов; бронь = тип + старт + контакты; занятость = наложение полуинтервалов                          | Accepted                   | [0011-derived-slots-from-event-types.md](0011-derived-slots-from-event-types.md) |

## Как добавить новый ADR

1. Новый файл `docs/adr/00NN-slug.md` (номер — максимальный существующий +1,
   по формату ADR-FORMAT.md).
2. Если новый ADR заменяет старый — у старого меняется только статус на
   `Superseded by ADR-00NN`, текст сохраняется.
3. Строка — в [`bmad-output/decision-log.md`](../../bmad-output/decision-log.md).
4. Строка в таблице выше.
