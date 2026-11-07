-- Деструктивная миграция на модель ADR-0011 (карта #28, D1–D5): типы событий,
-- рабочие часы, брони с интервалом; слоты больше не хранятся.
-- Старые таблицы удаляются вместе с дев-данными — продакшена нет (D5),
-- сохранение данных ADR-008 не требуется (superseded).

DROP TABLE "bookings";
DROP TABLE "slots";

-- CreateTable
CREATE TABLE "event_types" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "working_hours" (
    "weekday" INTEGER NOT NULL,
    "start_minutes" INTEGER NOT NULL,
    "end_minutes" INTEGER NOT NULL,
    "is_day_off" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type_id" TEXT NOT NULL,
    "starts_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "booker_name" TEXT NOT NULL,
    "booker_contact" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookings_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "working_hours_weekday_key" ON "working_hours"("weekday");

-- CreateIndex
CREATE INDEX "bookings_starts_at_ends_at_idx" ON "bookings"("starts_at", "ends_at");
