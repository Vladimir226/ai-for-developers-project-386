# Naming conventions

**Status:** Accepted
**Drives:** NFR-003
**Date:** 2026-11-07 (перенесён из `bmad-output/architecture.md` §3, карта #28/D11)

**Context:** Дешёвое сейчас и дорогое потом решение: без фиксации агенты
разъедутся по casing в URL, JSON, БД и TypeScript.

**Decision:**

- URL: kebab-case пути, ресурсы во множественном числе (`/api/v1/bookings`).
- JSON: поля — camelCase (`bookerName`, `startsAt`).
- БД (SQLite/Prisma): таблицы и колонки — snake_case (`booker_name`),
  в Prisma-схеме поля camelCase с `@map`.
- TypeScript: типы/классы — PascalCase; переменные/функции — camelCase;
  файлы компонентов — PascalCase.tsx, остальные — kebab-case.ts.
  Оговорка: зарезервированные имена файлов Next.js App Router
  (`page.tsx`, `layout.tsx`, `route.ts`, `middleware.ts` и т.п.) остаются в
  нижнем регистре — переименование ломает роутинг.
- Идентификаторы в коде — английские; строки UI — русские.
- Сущности домена: `Slot` (опубликованный интервал), `Booking` (бронь).

**Consequences — LOCKED for all stories:** новая сущность/эндпоинт следует
таблице выше без исключений; ревью историй отклоняет отклонения.

- Easier: предсказуемые имена → меньше правок при слиянии.
- Accepted cost: `@map`-дисциплина в Prisma-схеме.

**Alternatives:** единый casing везде (потеря идиоматичности на каждом слое).

**Revisit when:** — (конвенция не пересматривается, только расширяется).
