# System Architecture: «Запись на звонок» (Book-a-Call)

**Document Version:** 1.2
**Date:** 2026-11-07
**Author:** Winston (Architect)
**Track:** BMad Method
**Status:** Approved
**Source PRD:** `bmad-output/prd.md`
**Repository:** https://github.com/Vladimir226/ai-for-developers-project-386.git

> This is the single source of truth for cross-cutting technical decisions. Every
> story compiled downstream inherits the LOCKED decisions recorded here. Catching
> alignment at this layer is ~10x cheaper than during implementation.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Pattern](#2-architecture-pattern)
3. [Architecture Decision Records](#3-architecture-decision-records)
4. [Component Design](#4-component-design)
5. [Data Model](#5-data-model)
6. [API Specifications](#6-api-specifications)
7. [FR / NFR Coverage Matrix](#7-fr--nfr-coverage-matrix)
8. [Technology Stack](#8-technology-stack)
9. [Trade-off Analysis](#9-trade-off-analysis)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Future Considerations](#11-future-considerations)

---

## 1. System Overview

### Purpose

Упрощённый сервис бронирования времени по мотивам Cal.com. Владелец публикует
доступные интервалы времени, посетитель выбирает свободный интервал и
записывается на звонок. Учебный проект Хекслета: фокус — на процессе разработки
и устройстве приложения.

### Scope

**In Scope:**

- Публикация владельцем интервалов доступности (создание, просмотр, удаление)
- Публичная страница бронирования со свободными будущими интервалами
- Бронирование интервала с указанием имени и контакта
- Защита от двойного бронирования на уровне БД
- Просмотр и отмена бронирований владельцем
- Сборка в один Docker-образ, запуск в контейнере, персистентность через volume

**Out of Scope:**

- Авторизация, личные кабинеты, роли
- Интеграции с внешними календарями
- Уведомления (email/push)
- Мультивладельческая модель

### Architectural Drivers

NFR, которые сильнее всего давят на дизайн:

1. **NFR-001 (Portability):** один самодостаточный Docker-образ, `docker run`
   без внешних сервисов → встраиваемая БД (SQLite),单-артефактная сборка.
2. **NFR-002 (Data Integrity):** двойное бронирование исключено в принципе,
   включая конкурентные запросы → гарантия на уровне схемы БД, а не кода.
3. **NFR-003/NFR-009 (Maintainability + CI):** один язык на стеке, явные
   границы модулей, зелёный hexlet-check CI → TypeScript full-stack,
   Makefile-цели `install/test/lint`.

### Stakeholders & Constraints

- **Users:** один владелец (управляет интервалами и бронями) + неограниченное
  число посетителей (бронируют).
- **Team:** разработка ведётся AI-агентами при участии владельца проекта.
  Ключевой критерий выбора технологий — выравнивание параллельных агентов на
  одном контракте (эта архитектура) и минимализация числа артефактов.
- **Existing constraints:**
  - Обязательный CI `.github/workflows/hexlet-check.yml` — не удалять,
    не переименовывать, не редактировать (PRD, ограничение репозитория).
  - ТЗ проекта: работа с API — контракт-фёрст. Обязательны TypeSpec-контракт,
    сгенерированная OpenAPI-спецификация и клиентский SDK для фронтенда;
    серверные типы/маршруты генерируются, если фреймворк поддерживает
    (для Next.js App Router — нет), иначе сервер реализуется по контракту
    и проверяется тестами (ADR-010).
  - Стек свободный; результат: сборка в Docker-образ, запуск в контейнере.

---

## 2. Architecture Pattern

**Pattern:** Modular Monolith (монолитное Next.js-приложение с модульными
доменными границами).

**Justification:**

- Масштаб трека BMad Method (~15–25 историй) и одна роль «владелец» —
  микросервисы и serverless не имеют питающего NFR (REFERENCE rubric: не вводить
  без требования).
- Один процесс = один Docker-образ без оркестрации — прямое удовлетворение
  драйвера NFR-001.
- Единый язык (TypeScript) на UI и API сокращает поверхность рассинхронизации
  параллельных агентов (NFR-003).

**Alternatives considered:**

- **Microservices (API + отдельный фронт):** отвергнуто — нет требования
  масштабирования, два артефакта усложняют доставку одного образа.
- **Отдельный REST-бэкенд (NestJS/Express) + SPA:** отвергнуто — дублирование
  типов и инфраструктуры, два билд-пайплайна в одном образе; выигрыша для
  данного масштаба нет.
- **Serverless:** отвергнуто — противоречит NFR-001 (запуск в собственном
  контейнере).

**Application:** единое Next.js-приложение (App Router). API описывается
TypeSpec-контрактом (ADR-010); из него генерируются OpenAPI-спецификация,
клиентский SDK и Zod-схемы. Всё чтение данных (включая React Server
Components — self-fetch собственного API) и все мутации идут только через
сгенерированный SDK; прямые импорты доменных модулей из UI-слоя запрещены.
Мутации выполняют Route Handlers `/api/v1/*`, которые одновременно являются
публичным API. Домен разделён на два модуля: `availability` (интервалы) и
`bookings` (брони). Персистентность — Prisma + SQLite.

---

## 3. Architecture Decision Records

> Минимальный набор BMad (API style, data model, AuthN/AuthZ, state, errors,
> naming) + специфика проекта (контейнеризация, модель слотов, время).
>
> **Источник истины — файлы каталога [`docs/adr/`](../docs/adr/README.md)**
> (решение D11 карты #28): каждый ADR — отдельный файл `000N-slug.md`. Полные
> тексты ADR-0001…0010 перенесены туда из этого раздела (2026-11-07) и здесь
> не дублируются; новые ADR пишутся сразу файлами. Этот раздел — только
> индекс. Однострочные сводки —
> [`bmad-output/decision-log.md`](decision-log.md).

| ADR      | Title                                                                          | Status                     | Файл                                                                                         |
| -------- | ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------- |
| ADR-0001 | REST + JSON API с префиксом `/api/v1`                                          | Accepted                   | [0001-rest-json-api.md](../docs/adr/0001-rest-json-api.md)                                   |
| ADR-0002 | SQLite (WAL) через Prisma; файл БД в volume                                    | Accepted                   | [0002-sqlite-wal-prisma.md](../docs/adr/0002-sqlite-wal-prisma.md)                           |
| ADR-0003 | Без аутентификации; single-owner модель                                        | Accepted                   | [0003-single-owner-no-auth.md](../docs/adr/0003-single-owner-no-auth.md)                     |
| ADR-0004 | Server-authoritative state; без клиентского стора                              | Accepted (amended by 0010) | [0004-server-authoritative-state.md](../docs/adr/0004-server-authoritative-state.md)         |
| ADR-0005 | Конверт ошибок и ответов API                                                   | Accepted (amended by 0010) | [0005-api-error-envelope.md](../docs/adr/0005-api-error-envelope.md)                         |
| ADR-0006 | Naming conventions (URL/JSON/DB/TS/UI)                                         | Accepted                   | [0006-naming-conventions.md](../docs/adr/0006-naming-conventions.md)                         |
| ADR-0007 | Один Docker-образ: multi-stage, non-root, volume, healthcheck; Makefile для CI | Accepted                   | [0007-single-docker-image.md](../docs/adr/0007-single-docker-image.md)                       |
| ADR-0008 | Модель слотов: конкретные дискретные интервалы; 1 интервал = 1 звонок          | **Superseded by ADR-0011** | [0008-discrete-slots.md](../docs/adr/0008-discrete-slots.md)                                 |
| ADR-0009 | Время: хранение и передача UTC, отображение в APP_TZ                           | Accepted                   | [0009-utc-app-tz-time.md](../docs/adr/0009-utc-app-tz-time.md)                               |
| ADR-0010 | Контракт-фёрст: TypeSpec → OpenAPI → SDK + Zod; сервер по контракту            | Accepted                   | [0010-contract-first-typespec.md](../docs/adr/0010-contract-first-typespec.md)               |
| ADR-0011 | Вычисляемые слоты из типов событий и рабочих часов                             | Accepted                   | [0011-derived-slots-from-event-types.md](../docs/adr/0011-derived-slots-from-event-types.md) |

Разделы §4–§6 ниже всё ещё описывают модель ADR-0008 и приводятся к модели
ADR-0011 тикетами волны №2 (#32–#37); при противоречии побеждают файлы
`docs/adr/` и аддендум спеки №1 (issue #1).

---

## 4. Component Design

### Component Overview

```text
┌─────────────────────────── Next.js App (один контейнер) ───────────────────────────┐
│                                                                                     │
│  UI Layer (App Router)                                                              │
│  ├─ Public page  /            — свободные слоты, форма бронирования                 │
│  └─ Admin page   /admin       — управление интервалами, список броней, отмена       │
│                                                                                     │
│  API Layer (Route Handlers, REST /api/v1)                                           │
│  ├─ /api/v1/slots       GET, POST, DELETE                                           │
│  ├─ /api/v1/bookings    GET, POST, DELETE                                           │
│  └─ /api/health         GET (инфраструктурный, без версии)                          │
│                                                                                     │
│  Domain Layer (модули; единственное место бизнес-правил)                            │
│  ├─ availability — создание/удаление интервалов, проверка пересечений, свободные    │
│  │                 слоты                                                            │
│  └─ bookings     — бронирование (транзакция + констрейнт), отмена, список           │
│                                                                                     │
│  Infrastructure Layer                                                               │
│  ├─ contract/ (TypeSpec) → src/generated/ — OpenAPI, SDK, Zod (ADR-010)             │
│  ├─ Prisma Client (SQLite, WAL; /data/app.db)                                       │
│  ├─ lib/validation  — Zod-схемы из OpenAPI-контракта (ADR-005, ADR-010)             │
│  ├─ lib/http        — helpers ответов/ошибок (ADR-005), request-id                  │
│  └─ lib/logger      — структурные JSON-логи (NFR-006)                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component: Public Booking Page (`/`)

**Responsibility:** показать свободные будущие слоты и принять бронирование.

**Interfaces Provided:** — **Required:** GET /api/v1/slots, POST /api/v1/bookings
**Data Owned:** — **ADRs:** ADR-004, ADR-005, ADR-009
**NFRs:** NFR-004 (ru UI, адаптив), NFR-005

### Component: Admin Page (`/admin`)

**Responsibility:** CRUD интервалов и управление бронями (без auth — ADR-003).

**Interfaces Provided:** — **Required:** все `/api/v1` эндпоинты
**Data Owned:** — **ADRs:** ADR-003, ADR-004
**NFRs:** NFR-004

### Component: REST API (Route Handlers)

**Responsibility:** единая точка мутаций и публичного чтения; валидация Zod;
конверт ошибок.

**Interfaces Provided:** см. раздел 6 **Required:** domain-модули
**Data Owned:** — **ADRs:** ADR-001, ADR-005, ADR-006
**NFRs:** NFR-005, NFR-007

### Component: Domain Module `availability`

**Responsibility:** правила интервалов: создание с проверкой пересечений,
свободные слоты на период, удаление с каскадом броней.

**Interfaces Provided:** `listFreeSlots(from, to)`, `createSlot(dto)`,
`deleteSlot(id)` **Required:** Prisma
**Data Owned:** Slot **ADRs:** ADR-002, ADR-008, ADR-009
**NFRs:** NFR-002 (в части пересечений слотов)

### Component: Domain Module `bookings`

**Responsibility:** бронирование слота с атомарной защитой от дублей,
отмена, список.

**Interfaces Provided:** `bookSlot(dto)`, `cancelBooking(id)`, `listBookings()`
**Required:** Prisma **Data Owned:** Booking
**ADRs:** ADR-002, ADR-008 **NFRs:** NFR-002

### Component: Infrastructure (Prisma / validation / http / logger)

**Responsibility:** доступ к данным, валидация, формат ответов, логирование.

**ADRs:** ADR-002, ADR-005, ADR-006 **NFRs:** NFR-006, NFR-008

---

## 5. Data Model

> Управляется ADR-002, ADR-008, ADR-009. Все entity-формы общие для всех историй.

### Entity: Slot

**Purpose:** опубликованный владельцем дискретный интервал = один бронируемый звонок.

**Attributes:**

- `id` (TEXT, PK, UUID v4 — формат `@format("uuid")` из контракта #12; ADR-010 делает контракт источником истины API)
- `starts_at` (TEXT ISO-8601 UTC) — начало звонка
- `ends_at` (TEXT ISO-8601 UTC) — конец (эксклюзивно)
- `created_at` (TEXT ISO-8601 UTC)

**Relationships:** 1 — 0..1 `Booking`
**Indexes:** `starts_at` (диапазонные запросы свободных слотов)
**Constraints:** `ends_at > starts_at`; `starts_at` в будущем при создании;
пересечение с существующими слотами запрещено (проверка в модуле `availability`,
ошибка `SLOT_OVERLAP` → 409).

### Entity: Booking

**Purpose:** бронь звонка конкретным посетителем.

**Attributes:**

- `id` (TEXT, PK, cuid)
- `slot_id` (TEXT, FK → Slot, **UNIQUE**) — один активный слот = одна бронь
- `booker_name` (TEXT, 1..100)
- `booker_contact` (TEXT, 5..200; телефон или email — свободная форма)
- `comment` (TEXT NULL, 0..500)
- `created_at` (TEXT ISO-8601 UTC)

**Relationships:** N — 1 `Slot` (ON DELETE CASCADE)
**Indexes:** UNIQUE `slot_id`; `created_at` DESC
**Constraints:** двойное бронирование блокируется констрейнтом UNIQUE
(нарушение → `SLOT_ALREADY_BOOKED` → 409).

### Storage Strategy

- **Primary store:** SQLite (WAL), файл `/data/app.db` (ADR-002).
- **Cache:** нет — объём данных и нагрузка не требуют (NFR-005 закрывается
  индексом `starts_at`).
- **File/blob:** не требуется.
- **Retention / backup:** volume `/data`; резервная копия — копия файла БД
  при остановленном контейнере (стратегия; исполнение — вне этого документа).

---

## 6. API Specifications

**Protocol:** REST + JSON (ADR-001) **AuthN:** отсутствует (ADR-003)
**Versioning:** префикс `/api/v1`; ломающие изменения — новый префикс.

### `GET /api/v1/slots?from=<ISO>&to=<ISO>&view=free|all`

**Purpose:** слоты периода. Публичная страница использует `view=free`
(дефолт), админ-страница — `view=all` (FR-002) **Auth:** None
**Response 200:** `{"slots": [{ "id", "startsAt", "endsAt" }]}` — при
`view=free` только слоты без активной брони, целиком в будущем; при
`view=all` — все интервалы, включая забронированные и прошедшие (какие
забронированы, админ коррелирует с `GET /api/v1/bookings` по `slotId`).
`from`/`to` опциональны (по умолчанию `[now; now+14d]` — накрывает окно записи).
**Errors:** 422 `VALIDATION_ERROR`
**NFRs:** p95 < 300 мс (NFR-005)

### `POST /api/v1/slots`

**Purpose:** опубликовать интервал **Auth:** None (single-owner, ADR-003)
**Request:** `{ "startsAt": "<ISO-8601 UTC>", "endsAt": "<ISO-8601 UTC>" }`
**Response 201:** объект слота.
**Errors:** 422 `VALIDATION_ERROR`; 409 `SLOT_OVERLAP`
**Rules:** `startsAt` в будущем; `endsAt > startsAt` (ADR-008, ADR-009)

### `DELETE /api/v1/slots/{id}`

**Purpose:** удалить интервал (вместе с бронью — ADR-008) **Auth:** None
**Response:** 204 **Errors:** 404 `NOT_FOUND`

### `GET /api/v1/bookings`

**Purpose:** список броней владельца **Auth:** None
**Response 200:** `{"bookings": [{ "id", "slotId", "startsAt", "endsAt", "bookerName", "bookerContact", "comment", "createdAt" }]}`

### `POST /api/v1/bookings`

**Purpose:** забронировать звонок **Auth:** None
**Request:** `{ "slotId", "bookerName", "bookerContact", "comment"? }`
**Response 201:** объект брони.
**Errors:** 404 `NOT_FOUND` (слота нет); 409 `SLOT_ALREADY_BOOKED`;
422 `VALIDATION_ERROR`; 409 `SLOT_IN_PAST` (слот уже начался/прошёл)
**NFRs:** конкурентные запросы на один слот — ровно один 201, остальные 409
(NFR-002)

### `DELETE /api/v1/bookings/{id}`

**Purpose:** отменить бронь (слот снова свободен) **Auth:** None
**Response:** 204 **Errors:** 404 `NOT_FOUND`

### `GET /api/health`

**Purpose:** liveness-пробка контейнера **Auth:** None
**Response 200:** `{"status": "ok"}`

---

## 7. FR / NFR Coverage Matrix

| ID      | Type | Requirement                                  | Component(s)                 | ADR(s)                              | Status    |
| ------- | ---- | -------------------------------------------- | ---------------------------- | ----------------------------------- | --------- |
| FR-001  | FR   | Публикация интервала владельцем              | API, availability            | ADR-001, ADR-008                    | Addressed |
| FR-002  | FR   | Список интервалов + удаление                 | Admin UI, API, availability  | ADR-001, ADR-008                    | Addressed |
| FR-003  | FR   | Публичная страница свободных слотов          | Public UI, availability      | ADR-004, ADR-009                    | Addressed |
| FR-004  | FR   | Бронирование с именем и контактом            | Public UI, bookings          | ADR-001, ADR-005                    | Addressed |
| FR-005  | FR   | Исключение двойного бронирования             | bookings, БД                 | ADR-008, ADR-002                    | Addressed |
| FR-006  | FR   | Забронированный слот скрывается              | availability (listFreeSlots) | ADR-008                             | Addressed |
| FR-007  | FR   | Список броней + отмена                       | Admin UI, bookings           | ADR-001, ADR-008                    | Addressed |
| NFR-001 | NFR  | Один Docker-образ, volume                    | Dockerfile, Infra            | ADR-007, ADR-002                    | Addressed |
| NFR-002 | NFR  | Никаких двойных броней (в т.ч. конкурентных) | bookings, БД                 | ADR-008                             | Addressed |
| NFR-003 | NFR  | Один язык, границы модулей, тест-стратегия   | всё приложение               | ADR-004, ADR-006, §Testing          | Addressed |
| NFR-004 | NFR  | RU UI, адаптив, таймзона владельца           | UI                           | ADR-009                             | Addressed |
| NFR-005 | NFR  | p95 < 300 мс (демо)                          | API, БД                      | ADR-002 (индекс starts_at), ADR-005 | Addressed |
| NFR-006 | NFR  | JSON-логи с request-id                       | Infra (logger)               | ADR-005                             | Addressed |
| NFR-007 | NFR  | Валидация входов, non-root, без секретов     | API, Zod, Docker             | ADR-005, ADR-007                    | Addressed |
| NFR-008 | NFR  | /api/health, WAL, graceful shutdown          | Infra                        | ADR-002, ADR-007                    | Addressed |
| NFR-009 | NFR  | Зелёный hexlet-check CI                      | Makefile                     | ADR-007                             | Addressed |

### Detailed NFR notes (per driver)

- **NFR-001 (Portability):** multi-stage сборка standalone-выхода Next.js —
  единственный артефакт; SQLite в процессе — внешний сервисов нет (ADR-007).
- **NFR-002 (Data Integrity):** UNIQUE(`slot_id`) — истина последней инстанции;
  транзакция в `bookings` даёт чистый 409 вместо сырой ошибки констрейнта.
  Согласованность — strong (одна БД, локальные транзакции).
- **NFR-003 (Maintainability):** модули `availability`/`bookings` не импортируют
  друг друга напрямую (только через свои сервисные функции); UI не содержит
  бизнес-правил. Testing strategy (стратегия, не исполнение): unit — правила
  домена (Vitest); integration — Route Handlers на временной SQLite-БД; e2e —
  Playwright: публикация → бронирование → слот исчез.
- **NFR-005 (Performance):** единственный тяжёлый запрос — список слотов,
  закрывается индексом `starts_at`; кэширование не вводится (YAGNI).
- **Scalability note:** горизонтальное масштабирование не предусматривается
  (single owner, демо-нагрузка); вертикальный запас SQLite/WAL избыточен.
  Путь роста — в §11.
- **NFR-007 (Security):** policy приложения — security-минимум: без
  authentication/authorization (ADR-003, ограничение PRD); input validation
  каждого запроса Zod-схемами (ADR-005); контейнер non-root, секреты не
  запекаются в образ (ADR-007); encryption in transit — внешний TLS-прокси при
  публикации, в образ не входит (single-container, вне скоупа).
- **Observability:** каждый запрос логируется одной JSON-строкой
  (request-id, method, path, status, duration ms); агрегация логов вне скоупа.

---

## 8. Technology Stack

| Layer          | Choice                             | Version    | Rationale (→ driver)                                                                                                                                                | ADR              |
| -------------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Language       | TypeScript                         | 5.x        | Один язык на стеке → выравнивание агентов (NFR-003)                                                                                                                 | ADR-004          |
| Framework      | Next.js (App Router)               | 15.x       | RSC-чтение + Route Handlers в одном артефакте → single image (NFR-001)                                                                                              | ADR-001, 004     |
| Styling        | TailwindCSS                        | 4.x        | Быстрые UI-итерации, адаптив без кастомного CSS-слоя (NFR-004)                                                                                                      | —                |
| Validation     | Zod                                | 3.x        | Схемы генерируются из OpenAPI — один источник валидации (NFR-007). `openapi-zod-client` генерирует zod-3 синтаксис — до поддержки генератором zod 4 остаёмся на 3.x | ADR-005, ADR-010 |
| API contract   | TypeSpec                           | latest     | ТЗ: контракт — источник истины API                                                                                                                                  | ADR-010          |
| SDK codegen    | openapi-typescript + openapi-fetch | latest     | Типы + нативный fetch-клиент из OpenAPI (ТЗ)                                                                                                                        | ADR-010          |
| Zod codegen    | openapi-zod-client                 | latest     | Zod-схемы из OpenAPI; конформанс в тестах                                                                                                                           | ADR-010          |
| Spec lint      | @redocly/cli                       | latest     | Линт OpenAPI + drift-check в `make lint`                                                                                                                            | ADR-010          |
| ORM            | Prisma                             | 6.x        | Типобезопасный доступ + миграции; единственный владелец схемы (NFR-003)                                                                                             | ADR-002          |
| Database       | SQLite (WAL)                       | встроенная | Нулевая конфигурация в контейнере (NFR-001, NFR-008)                                                                                                                | ADR-002          |
| Unit/API tests | Vitest                             | 3.x        | Нативный TS, общий toolchain с Next (NFR-003)                                                                                                                       | —                |
| E2E tests      | Playwright                         | 1.x        | Единственный e2e-сценарий бронирования (NFR-003)                                                                                                                    | —                |
| Lint/format    | ESLint (flat config), Prettier     | latest     | Единый стиль для агентов (NFR-009)                                                                                                                                  | ADR-006          |
| Runtime        | Node.js                            | 22 LTS     | Совпадает с базовым образом `node:22-alpine` (NFR-001)                                                                                                              | ADR-007          |
| Infrastructure | Docker multi-stage, node:22-alpine | —          | Ограничение задания (NFR-001, NFR-007)                                                                                                                              | ADR-007          |
| CI glue        | Makefile (install/test/lint)       | —          | Требование hexlet-check (NFR-009)                                                                                                                                   | ADR-007          |

**Alternatives considered:** PostgreSQL — мощнее, но ломает single-image драйвер;
NestJS+SPA — два билда в одном образе без выгоды масштаба; Drizzle вместо
Prisma — легче, но слабее миграционный инструментарий для учебного проекта.

---

## 9. Trade-off Analysis

### Trade-off: SQLite vs PostgreSQL

**Decision:** SQLite (ADR-002)
**Options:** SQLite — ноль зависимостей, файл в volume, WAL; PostgreSQL —
прод-практики, конкурентная запись, но второй контейнер/сервис.
**Rationale:** жёсткий драйвер NFR-001 (один образ, `docker run`); демо-нагрузка
не требует сервера БД.
**Accepted:** Benefit — простота доставки и бэкапа / Cost — одна запись
одновременно, нет сетевого доступа / Mitigation — WAL, короткие транзакции.
**Revisit when:** несколько инстансов приложения или ощутимые очереди записи.

### Trade-off: Full-stack Next.js vs отдельный API + SPA

**Decision:** единое Next.js-приложение (§2)
**Options:** монолит Next — один артефакт, общие типы; API+SPA — чище разделение,
но два пайплайна.
**Rationale:** меньше артефактов → меньше точек расхождения агентов (NFR-003) и
проще образ (NFR-001).
**Accepted:** Benefit — один билд / Cost — UI и API связаны фреймворком /
Mitigation — доменные модули изолируют бизнес-логику от Next-слоя.
**Revisit when:** появится независимый от UI потребитель API.

### Trade-off: дискретные слоты vs правила повторяемости

**Decision:** конкретные интервалы (ADR-008)
**Rationale:** PRD требует только «публикацию интервалов»; генерация слотов из
правил — крупнейший источник сложности в booking-домене.
**Accepted:** Benefit — минимальная честная модель / Cost — ручной ввод каждого
интервала / Mitigation — массовый ввод нескольких интервалов за раз в UI.
**Revisit when:** запрос на recurring-доступность.

### Trade-off: открытый /admin без auth

**Decision:** без аутентификации (ADR-003)
**Rationale:** явное ограничение PRD; учебный контекст без публичного продакшена.
**Accepted:** Benefit — ноль историй на auth / Cost — управление доступно
любому с URL / Mitigation — осознанный риск, задокументирован.
**Revisit when:** публикация в открытый доступ.

---

## 10. Deployment Architecture

### Environments

- **Development:** `npm run dev` (локальная SQLite в `./dev-data/`, volume не нужен).
- **Production (целевая форма):** единственный Docker-контейнер на любой
  Linux-хост с Docker.

### Topology

```text
docker build -t book-a-call .
docker run -d -p 3000:3000 -v book-a-call-data:/data \
  -e APP_TZ=Europe/Moscow book-a-call
```

Один контейнер, один процесс (Node standalone), SQLite-файл в volume `/data`.
Балансировщиков, DNS и оркестрации нет — вне скоупа задания.

### Strategy

- **Deployment method:** замена образа (пересборка/новый тег) и рестарт
  контейнера; миграции применяются при старте (`prisma migrate deploy`).
- **Rollback:** запуск предыдущего тега образа; volume с БД остаётся совместимым
  назад в рамках миграций Prisma (destructive-миграции запрещены без ADR).
- **Scaling:** вертикально в пределах одного контейнера; горизонтальный путь —
  §11.

---

## 11. Future Considerations

**Anticipated changes:**

- Ближайший срок: токен-заглушка для `/admin` (env `ADMIN_TOKEN`) при
  публикации проекта.
- Средний: статусная история броней (`cancelled` вместо DELETE) и повторяющаяся
  доступность — расширения модели ADR-008 без смены контракта API.
- Долгий: мультивладельческая модель (появляется `Owner`-entity, auth, пути
  `/u/{slug}`).

**Scalability path:** один инстанс + SQLite → (при реальной нагрузке)
PostgreSQL в отдельном контейнере + N реплик Next.js за reverse-proxy.
Миграция — смена provider в Prisma-схеме + переезд данных; API-контракт
не меняется.

**Revisit triggers (aggregated from ADRs):**

- ADR-002: конкурентная запись стала узким местом / нужен второй инстанс.
- ADR-003: приложение публикуется в открытый доступ.
- ADR-004: нужны live-обновления слотов у посетителей.
- ADR-008: запрошена повторяющаяся доступность или история отмен.
- ADR-009: мультивладельческая модель.

---

## Appendix

### Glossary

| Term            | Definition                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| Слот (Slot)     | Опубликованный владельцем дискретный интервал; равен одному бронируемому звонку |
| Бронь (Booking) | Закрепление слота за посетителем (имя + контакт)                                |
| Владелец        | Единственный пользователь, управляющий интервалами (single-owner, без auth)     |
| WAL             | Write-Ahead Logging — режим SQLite, допускающий чтение во время записи          |

### References

- PRD: `bmad-output/prd.md`
- Decision log: `bmad-output/decision-log.md`
- Референс поведения: Cal.com (упрощённый сценарий)

### Document History

| Version | Date       | Author                 | Changes                                                                                                                                                         |
| ------- | ---------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-11-07 | Winston (Architect)    | Initial architecture                                                                                                                                            |
| 1.1     | 2026-11-07 | Grilling session       | ADR-010 (контракт-фёрст: TypeSpec → OpenAPI → SDK + Zod); ADR-004/005 поправлены; `view=free\|all` в `GET /api/v1/slots`                                        |
| 1.2     | 2026-11-07 | Карта решений №2 (#28) | ADR разложены на файлы `docs/adr/` (D11); добавлен ADR-0011 «Вычисляемые слоты из типов событий и рабочих часов»; ADR-008 → Superseded by ADR-0011; §3 — индекс |

---

**END OF DOCUMENT** — Ready for handoff to bmad-epics-and-stories once validation passes.
