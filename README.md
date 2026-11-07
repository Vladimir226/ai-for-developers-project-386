# Запись на звонок (Book-a-Call)

[![hexlet-check](https://github.com/Vladimir226/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/Vladimir226/ai-for-developers-project-386/actions)

Мини-сервис бронирования звонков по мотивам Cal.com: владелец публикует интервалы
своей доступности, посетитель видит только свободные будущие окна и записывается
на звонок за пару кликов. Двойное бронирование исключено на уровне базы данных,
всё приложение доставляется одним Docker-образом и хранит данные в volume.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Возможности

- публикация дискретных интервалов на странице владельца `/admin` — можно
  несколько за один заход; статусы «Свободен / Забронирован / Прошёл»;
- публичная страница `/` без регистрации: календарь на 14 дней вперёд (окно
  записи — 14 дат, включая сегодня), слоты выбранного дня, форма с именем,
  контактом и необязательным комментарием;
- времена — в таймзоне владельца (`APP_TZ`, по умолчанию Europe/Moscow) с явным
  указанием пояса; хранение и передача — в UTC;
- забронированный слот мгновенно исчезает из публичного списка; повторная
  попытка получает 409 `SLOT_ALREADY_BOOKED` и человекочитаемое сообщение;
- отмена брони возвращает слот в список свободных; удаление интервала убирает
  и связанную бронь;
- мобильная адаптация страниц, русскоязычный интерфейс и ошибки.

## Стек

| Слой         | Технологии                                                              |
| ------------ | ----------------------------------------------------------------------- |
| Язык         | TypeScript 5                                                            |
| Приложение   | Next.js 15 (App Router), React 19                                       |
| Стили        | TailwindCSS 4                                                           |
| БД           | SQLite (режим WAL) + Prisma 6, миграции                                 |
| Контракт API | TypeSpec → OpenAPI → SDK + Zod-схемы ([ADR-010](docs/adr/README.md))    |
| Тесты        | Vitest (unit + API-интеграция), Playwright (e2e)                        |
| Доставка     | один multi-stage Docker-образ (`node:22-alpine`), non-root, HEALTHCHECK |
| Рантайм      | Node.js 22 LTS (см. [`.nvmrc`](.nvmrc))                                 |

## Установка

### Docker (рекомендуется)

Нужен только Docker. Клонируем, собираем образ, запускаем контейнер: БД — файл
SQLite в volume `/data`, конфигурация — переменными окружения.

```bash
git clone https://github.com/Vladimir226/ai-for-developers-project-386.git
cd ai-for-developers-project-386
docker build -t book-a-call .
docker run -d --name book-a-call -p 3000:3000 \
  -v book-a-call-data:/data -e APP_TZ=Europe/Moscow book-a-call
```

При старте контейнер сам применяет миграции (`prisma migrate deploy`) и включает
WAL-режим SQLite, затем поднимает сервер на порту 3000. Готовность проверяет
HEALTHCHECK и эндпоинт здоровья:

```bash
curl http://localhost:3000/api/health   # {"status":"ok"}
```

Открыть в браузере: публичная страница — `http://localhost:3000/`,
панель владельца — `http://localhost:3000/admin`.

Переменные окружения контейнера:

| Переменная     | По умолчанию        | Смысл                                        |
| -------------- | ------------------- | -------------------------------------------- |
| `APP_TZ`       | `Europe/Moscow`     | таймзона отображения (IANA)                  |
| `DATABASE_URL` | `file:/data/app.db` | файл SQLite; меняют редко, обычно не трогают |
| `PORT`         | `3000`              | порт внутри контейнера                       |

Остановить и удалить (данные в volume переживут рестарт; удаляются отдельно):

```bash
docker rm -f book-a-call
docker volume rm book-a-call-data   # сотрёт все брони
```

### Из исходников (локальная разработка)

Требуются Node.js 22 (версия — в [`.nvmrc`](.nvmrc)) и npm. Docker не нужен.

```bash
git clone https://github.com/Vladimir226/ai-for-developers-project-386.git
cd ai-for-developers-project-386
cp .env.example .env        # DATABASE_URL и APP_TZ для локальной разработки
npm install                 # postinstall сам выполнит prisma generate
npx prisma migrate deploy   # создаст локальную SQLite-БД с таблицами
npm run dev                 # http://localhost:3000
```

Прод-сборка без Docker:

```bash
npm run build
npm start                   # http://localhost:3000
```

Артефакты контракта (`src/generated/`) закоммичены — для запуска `npm run
contract:gen` не нужен; он нужен только после правок `contract/`.

Заметка: Prisma разрешает относительный `DATABASE_URL` от каталога `prisma/`,
поэтому локальный файл БД из `.env.example` реально появится в
`prisma/dev-data/app.db` (каталог в `.gitignore`).

## Использование

> Доменная модель меняется на «типы событий + рабочие часы + вычисляемые
> слоты» ([ADR-0011](docs/adr/0011-derived-slots-from-event-types.md), карта
> #28): контракт и схема БД уже переведены (#32), серверная реализация — #33,
> UI — #34/#35. До #33 доменных API-эндпоинтов нет — страницы `/` и `/admin`
> временно показывают заглушки; жив только `GET /api/health`.

Обновлённый сценарий (владелец настраивает типы и часы → гость бронирует)
вернётся в README вместе с реализацией #33. Запись терминала ниже сделана для
прежней модели ручной публикации интервалов:

### Запись терминала

Запись сквозного сценария через API запущенного контейнера (публикация →
бронирование → двойное бронирование 409 → отмена) — в
[`docs/asciinema/book-a-call-demo.cast`](docs/asciinema/book-a-call-demo.cast):

```bash
asciinema play docs/asciinema/book-a-call-demo.cast
```

## API

Контракт-фёрст: единственный источник истины API — TypeSpec-контракт
[`contract/main.tsp`](contract/main.tsp); из него генерируются OpenAPI
(`src/generated/openapi.yaml`), типы SDK и Zod-схемы. UI обращается к API только
через сгенерированный SDK.

| Метод    | Путь                             | Что делает                                                            |
| -------- | -------------------------------- | --------------------------------------------------------------------- |
| `GET`    | `/api/health`                    | здоровье сервиса (инфраструктурный, без версии)                       |
| `GET`    | `/api/v1/event-types`            | список типов событий (гость и владелец)                               |
| `POST`   | `/api/v1/event-types`            | создать тип события (`title`, `description`?, `durationMinutes`)      |
| `PUT`    | `/api/v1/event-types/{id}`       | изменить тип события (200/404/422)                                    |
| `DELETE` | `/api/v1/event-types/{id}`       | удалить тип каскадно с его бронями (204/404, D4)                      |
| `GET`    | `/api/v1/event-types/{id}/slots` | вычисляемые свободные слоты типа (`from`/`to`?, дефолт — 14 дней, D6) |
| `GET`    | `/api/v1/working-hours`          | рабочие часы недели (7 дней)                                          |
| `PUT`    | `/api/v1/working-hours`          | задать рабочие часы недели (200/422)                                  |
| `GET`    | `/api/v1/bookings`               | список броней владельца (`upcoming`? — резерв #36)                    |
| `POST`   | `/api/v1/bookings`               | забронировать слот (`eventTypeId`, `startsAt`, имя, контакт)          |
| `DELETE` | `/api/v1/bookings/{id}`          | отменить бронь (204/404)                                              |

Слоты не хранятся и вычисляются на лету из рабочих часов и длительности типа
([ADR-0011](docs/adr/0011-derived-slots-from-event-types.md)); ручная публикация
интервалов (`POST/DELETE /api/v1/slots`, `view=free|all`) удалена. Серверная
реализация операций — #33: до него из перечисленного жив только `/api/health`.

Ошибки — единый конверт `{"error": {"code", "message", "details"?}}` со
стабильными кодами `VALIDATION_ERROR`, `NOT_FOUND`, `SLOT_ALREADY_BOOKED`,
`SLOT_IN_PAST`; сообщения — на русском. Сквозной пример curl появится вместе с
реализацией сервера (#33).

## Проверки и тесты

```bash
npm run check           # всё сразу: eslint + tsc + redocly + drift-check контракта,
                        # prettier и тесты Vitest (та же команда гоняется в CI)
npm test                # только тесты (unit + API-интеграция)
npm run lint            # только линтеры
npm run contract:gen    # перегенерация артефактов контракта после правок contract/
```

То же самое через Makefile (его цели — клей CI Хекслета): `make install`,
`make test`, `make lint`, `make check`.

E2E-сценарий (Playwright, шов 2) — отдельной командой; прогон сам собирает
приложение и поднимает его с временной БД на порту 3100, dev-данные не трогает:

```bash
npx playwright install chromium   # один раз
npm run test:e2e
```

## Архитектура и документы

- [`docs/adr/`](docs/adr/README.md) — ADR-0001…0011 отдельными файлами
  (канонический источник решений; ADR-008 superseded by ADR-0011)
- [`GLOSSARY.md`](GLOSSARY.md) — термины проекта
- [`bmad-output/architecture.md`](bmad-output/architecture.md) — архитектурный
  документ (§3 — индекс ADR, исторический)
- [`docs/design/README.md`](docs/design/README.md) — дизайн-направление и токены
- [`contract/main.tsp`](contract/main.tsp) — TypeSpec-контракт API

Кратко: единое Next.js-приложение (App Router) — страницы и Route Handlers
`/api/v1/*` в одном артефакте; доменная логика в `src/domain/` (`availability`,
`bookings`), инфраструктура в `src/lib/`; сервер — источник истины, UI ходит
через SDK и `router.refresh()`; схема БД меняется только миграциями Prisma.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
