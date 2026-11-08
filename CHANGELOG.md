# Changelog

## [1.1.0](https://github.com/Vladimir226/ai-for-developers-project-386/compare/v1.0.0...v1.1.0) (2026-11-08)


### Features

* **public:** страница «Предстоящие записи» — публичный список предстоящих броней ([#57](https://github.com/Vladimir226/ai-for-developers-project-386/issues/57)) ([fafd8ba](https://github.com/Vladimir226/ai-for-developers-project-386/commit/fafd8ba84ecfdbf4a2039144cc08e798eee099c3))

## 1.0.0 (2026-11-08)

### Features

- **admin:** UI публикации и управления интервалами ([#5](https://github.com/Vladimir226/ai-for-developers-project-386/issues/5)) ([#20](https://github.com/Vladimir226/ai-for-developers-project-386/issues/20)) ([4d6f1ba](https://github.com/Vladimir226/ai-for-developers-project-386/commit/4d6f1ba7f97e951c3a5bce6ff00fbe49d92acb78))
- **admin:** панель владельца — CRUD типов событий и редактор рабочих часов ([#34](https://github.com/Vladimir226/ai-for-developers-project-386/issues/34)) ([#47](https://github.com/Vladimir226/ai-for-developers-project-386/issues/47)) ([d009c42](https://github.com/Vladimir226/ai-for-developers-project-386/commit/d009c423c3d68b5bc7c6a924466b626d20c3c414))
- **admin:** раздел «Брони» — предстоящие встречи всех типов с отменой ([#36](https://github.com/Vladimir226/ai-for-developers-project-386/issues/36)) ([#49](https://github.com/Vladimir226/ai-for-developers-project-386/issues/49)) ([32d112c](https://github.com/Vladimir226/ai-for-developers-project-386/commit/32d112c8c7ac6274ce1c21a1d3be5982ac04823f))
- **admin:** список броней и отмена ([#8](https://github.com/Vladimir226/ai-for-developers-project-386/issues/8)) ([#22](https://github.com/Vladimir226/ai-for-developers-project-386/issues/22)) ([3a5e58c](https://github.com/Vladimir226/ai-for-developers-project-386/commit/3a5e58c2084c67633686b032b46f359229b1ed67))
- **api:** сервер по контракту v2 — типы событий, рабочие часы, вычисляемые слоты, бронирование ([#33](https://github.com/Vladimir226/ai-for-developers-project-386/issues/33)) ([#46](https://github.com/Vladimir226/ai-for-developers-project-386/issues/46)) ([3a06324](https://github.com/Vladimir226/ai-for-developers-project-386/commit/3a06324745f3116a5887e226d0900ca2df3fef02))
- **bookings:** схема Booking + REST API броней и защита от двойного бронирования ([#6](https://github.com/Vladimir226/ai-for-developers-project-386/issues/6)) ([#18](https://github.com/Vladimir226/ai-for-developers-project-386/issues/18)) ([04274b3](https://github.com/Vladimir226/ai-for-developers-project-386/commit/04274b36e369ea2063c4e4adbc9739370e736acb))
- **contract:** TypeSpec-контракт + OpenAPI + SDK-пайплайн ([#12](https://github.com/Vladimir226/ai-for-developers-project-386/issues/12)) ([#15](https://github.com/Vladimir226/ai-for-developers-project-386/issues/15)) ([f9f244c](https://github.com/Vladimir226/ai-for-developers-project-386/commit/f9f244c73904b61856339d17df92e4f055192e3c))
- **contract:** модель типов событий, рабочих часов и вычисляемых слотов ([#32](https://github.com/Vladimir226/ai-for-developers-project-386/issues/32)) ([#45](https://github.com/Vladimir226/ai-for-developers-project-386/issues/45)) ([8214354](https://github.com/Vladimir226/ai-for-developers-project-386/commit/82143548be948e73e3a336c6307406d99d8eae38))
- **deploy:** blueprint Render, MCP-конфиг проекта и раздел «Деплой» в README ([#41](https://github.com/Vladimir226/ai-for-developers-project-386/issues/41)) ([#54](https://github.com/Vladimir226/ai-for-developers-project-386/issues/54)) ([717bac6](https://github.com/Vladimir226/ai-for-developers-project-386/commit/717bac6f56817dc28e8663b866594660a1b280f7))
- **docker:** герметичная сборка — шрифт из npm и healthcheck из $PORT ([#44](https://github.com/Vladimir226/ai-for-developers-project-386/issues/44)) ([cb42ce4](https://github.com/Vladimir226/ai-for-developers-project-386/commit/cb42ce42623328d30b26c149339428f2c6ed7c1d))
- **infra:** SQLite/Prisma + один Docker-образ ([#3](https://github.com/Vladimir226/ai-for-developers-project-386/issues/3)) ([#16](https://github.com/Vladimir226/ai-for-developers-project-386/issues/16)) ([5d670f5](https://github.com/Vladimir226/ai-for-developers-project-386/commit/5d670f5210f04eceac26e77077929c84e97ec481))
- **public:** двухшаговый флоу гостя — виды брони → календарь → бронь ([#35](https://github.com/Vladimir226/ai-for-developers-project-386/issues/35)) ([#48](https://github.com/Vladimir226/ai-for-developers-project-386/issues/48)) ([ca00ebc](https://github.com/Vladimir226/ai-for-developers-project-386/commit/ca00ebcd0551e76cfb90ee8a822d05d1ca662e11))
- **public:** публичная страница бронирования ([#7](https://github.com/Vladimir226/ai-for-developers-project-386/issues/7)) ([#21](https://github.com/Vladimir226/ai-for-developers-project-386/issues/21)) ([d0be7c8](https://github.com/Vladimir226/ai-for-developers-project-386/commit/d0be7c80ecf236aaf01eebe673d5cce55e9c6930))
- **slots:** схема Slot + REST API публикации, списка и удаления ([#4](https://github.com/Vladimir226/ai-for-developers-project-386/issues/4)) ([#17](https://github.com/Vladimir226/ai-for-developers-project-386/issues/17)) ([4abd4b2](https://github.com/Vladimir226/ai-for-developers-project-386/commit/4abd4b25a35bfa9557a851e1638b77fa080237e5))

### Bug Fixes

- **e2e:** детерминированная временная БД и уборка после прогона ([#9](https://github.com/Vladimir226/ai-for-developers-project-386/issues/9)) ([#24](https://github.com/Vladimir226/ai-for-developers-project-386/issues/24)) ([e6f6291](https://github.com/Vladimir226/ai-for-developers-project-386/commit/e6f6291b13f03414c59a63d8bc08db8276fd4fac))
- **public:** окно записи — 14 дат включая сегодня вместо месяца ([#27](https://github.com/Vladimir226/ai-for-developers-project-386/issues/27)) ([1a703cf](https://github.com/Vladimir226/ai-for-developers-project-386/commit/1a703cf9be5a8af3a0d732d82ef54ec5310d92b5)), closes [#26](https://github.com/Vladimir226/ai-for-developers-project-386/issues/26)
