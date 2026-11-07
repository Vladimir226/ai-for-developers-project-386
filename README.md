# Запись на звонок (Book-a-Call)

[![hexlet-check](https://github.com/Vladimir226/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/Vladimir226/ai-for-developers-project-386/actions)

Мини-сервис бронирования звонков по мотивам Cal.com: владелец задаёт типы
событий и рабочие часы, свободные слоты вычисляются на лету, а гость видит
только свободные будущие окна и записывается на звонок за пару кликов.
Двойное бронирование исключено серверной транзакцией с предикатом наложения
интервалов (любые типы событий), всё приложение доставляется одним
Docker-образом и хранит данные в volume.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Возможности

- типы событий (владелец): вид брони с названием, описанием и длительностью
  15..180 минут; длительность задаёт и длину слота, и шаг стартов; удаление
  типа — каскадное вместе с его бронями;
- рабочие часы по дням недели: дефолт Пн–Пт 09:00–18:00, Сб–Вс выходные,
  редактируются полной неделей; перерывов внутри дня нет;
- вычисляемые слоты: окно записи — 14 календарных дней с сегодня, слоты
  генерируются внутри рабочих часов и не хранятся в БД;
- занятость — наложение интервалов с любой активной бронью, включая другие
  типы: повторная попытка получает 409 `SLOT_ALREADY_BOOKED` с понятным
  сообщением, примыкающие интервалы допустимы;
- отмена брони возвращает время в свободные; брони в прошлом отклоняются
  409 `SLOT_IN_PAST`;
- времена — в таймзоне владельца (`APP_TZ`, по умолчанию Europe/Moscow) с явным
  указанием пояса; хранение и передача — в UTC;
- русскоязычные сообщения ошибок, мобильная адаптация страниц.

> Интерфейс страниц `/` и `/admin` временно показывает заглушки — UI новой
> модели в #34/#35; всё перечисленное уже работает через API (см. «API»).

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

## Деплой на Render

Прод — [Render](https://render.com) (решение D9): разворачивается тот же
Docker-образ сборкой из репозитория. Инфраструктура объявлена в
[`render.yaml`](render.yaml) (blueprint): план `starter`, регион `frankfurt`,
persistent disk 1 ГБ в `/data`, health check `/api/health`. Диски недоступны
на бесплатном плане Render ([docs](https://render.com/docs/free)) — он
подошёл бы только с удалённым блоком `disk` и с потерей данных на каждом
рестарте; запасная платформа по карте решений — Railway.

### Запуск в несколько кликов

1. [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Blueprint** → выбрать этот репозиторий (blueprint подхватится из
   `render.yaml`).
2. Подтвердить создание сервиса `book-a-call` — план, регион и диск уже
   описаны в файле.
3. Дождаться конца сборки и зелёного статуса: Render соберёт образ по
   `Dockerfile`, применит миграции при старте контейнера и выдаст публичный
   URL вида `https://book-a-call.onrender.com`.

`PORT` в blueprint не задаётся: Render сам передаёт его сервису (дефолт
10000), а сервер слушает `${PORT}` — тот же контракт, что и локально. Пуш в
`main` по умолчанию запускает автодеплой.

### Публичная ссылка

<!-- PUBLIC_URL -->

**Публичный URL:** `<!-- PUBLIC_URL -->` — после первого деплоя заменить
плейсхолдер реальной ссылкой (ищется по `PUBLIC_URL`) и закоммитить.

### Приёмка по публичной ссылке

Полный сценарий с примерами — в разделе «Использование»; по публичной ссылке
он же от начала до конца (`BASE=https://<публичный-URL>/api/v1`):

1. `POST /api/v1/event-types` — создать тип события (201);
2. `GET /api/v1/event-types/{id}/slots` — свободные слоты на 14 дней;
3. `POST /api/v1/bookings` одним из слотов — бронь создана (201);
4. повторная бронь пересекающегося времени (тем же или другим типом) —
   отклонена с 409 `SLOT_ALREADY_BOOKED`;
5. `GET /api/v1/bookings?upcoming=true` — бронь видна у владельца;
6. в UI: гость проходит флоу на `/`, владелец видит бронь в разделе «Брони»
   на `/admin`.

### Подключение Render MCP (без секретов в git)

Проектная конфигурация [`opencode.json`](opencode.json) уже подключает
[удалённый MCP-сервер Render](https://render.com/docs/mcp-server) к OpenCode:
в файле только URL и ссылка на переменную окружения `{env:RENDER_API_KEY}` —
никаких секретов в репозитории нет и не должно быть.

1. Создать API-ключ: Render → [Account Settings → API
   Keys](https://dashboard.render.com/u/settings#api-keys).
2. Экспортировать в окружение пользователя, под которым работает OpenCode:
   ```bash
   export RENDER_API_KEY=rnd_xxxxxxxx   # в ~/.zshrc или ~/.bashrc
   ```
3. Проверить подключение (подхватывается без перезапуска OpenCode):
   ```bash
   opencode mcp list   # ожидание: ✓ render connected
   ```

Дальше агенту достаточно фразы «задеплой book-a-call на Render и дай публичную
ссылку»: MCP умеет создавать сервисы, смотреть деплои, логи и метрики.

### Данные и перезапуски

- БД — файл `/data/app.db` на persistent disk: переживает деплой, рестарт и
  замедление сервиса, удаляется только вместе с диском (Disk → Delete в
  дашборде);
- Render снимает снапшот диска раз в сутки и хранит 7 дней — это disaster
  recovery, а не бэкап по расписанию;
- деплой сервиса с диском — не zero-downtime: старый инстанс останавливается
  до старта нового (секунды недоступности), это защита от одновременной
  записи двух версий в один SQLite-файл;
- если в логах первого старта видно `[entrypoint] не могу писать в /data` —
  платформа отдала диск с чужими правами (например, uid 0): entrypoint
  проверяет это явно и падает ярко. Обходной фикс — инициализация диска от
  root в entrypoint с понижением до `node` (`su-exec`) отдельным коммитом;
  заведите issue, и образ поправим.

## Использование

> Сервер новой модели реализован (#33): типы событий, рабочие часы,
> вычисляемые слоты и брони доступны через API (примеры ниже). Страницы
> `/` и `/admin` до #34/#35 показывают заглушки — сквозной сценарий ниже
> идёт через curl. Запись терминала сделана для прежней модели ручной
> публикации интервалов и обновится вместе с браузерным сценарием (#37):

### Сквозной сценарий через API

```bash
BASE=http://localhost:3000/api/v1

# 1. Тип события (владелец): название, описание, длительность 15..180 минут
curl -s -X POST $BASE/event-types -H 'content-type: application/json' \
  -d '{"title":"Консультация","description":"Созвон 30 минут","durationMinutes":30}'
# → 201 {"id":"…","title":"Консультация",…}

# 2. Рабочие часы: без настройки действует дефолт Пн–Пт 09:00–18:00
curl -s $BASE/working-hours

# 3. Свободные слоты типа (id из шага 1): окно 14 дней по умолчанию
curl -s $BASE/event-types/<id>/slots

# 4. Бронь гостем: startsAt — один из стартов шага 3
curl -s -X POST $BASE/bookings -H 'content-type: application/json' \
  -d '{"eventTypeId":"<id>","startsAt":"2026-11-11T06:00:00Z","bookerName":"Мария","bookerContact":"telegram: @maria"}'
# → 201 {"id":"…","startsAt":"2026-11-11T06:00:00.000Z","endsAt":"…06:30:00.000Z",…}

# 5. То же время снова (в т.ч. другим типом) → 409 пересечения интервалов
#    {"error":{"code":"SLOT_ALREADY_BOOKED","message":"Время пересекается…"}}

# 6. Брони владельца (только предстоящие — ?upcoming=true)
curl -s $BASE/bookings
```

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
интервалов (`POST/DELETE /api/v1/slots`, `view=free|all`) удалена. Все операции
реализованы сервером вручную по контракту (генератора Route Handlers для
Next.js нет — ADR-010); конформанс проверяется integration-тестами, парсящими
ответы сгенерированными Zod-схемами. UI ходит через SDK и появится в #34/#35.

Ошибки — единый конверт `{"error": {"code", "message", "details"?}}` со
стабильными кодами `VALIDATION_ERROR`, `NOT_FOUND`, `SLOT_ALREADY_BOOKED`,
`SLOT_IN_PAST`; сообщения — на русском. Сквозной пример curl — в разделе
«Использование» выше.

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
