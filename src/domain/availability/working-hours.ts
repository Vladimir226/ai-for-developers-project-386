import { getDb } from '@/lib/db/prisma';
import type { WorkingDayHours } from './slots';

// Доменный модуль availability: рабочие часы недели (D3, ADR-0011).
// Дефолт Пн–Пт 09:00–18:00, Сб–Вс выходные живёт в памяти: после
// деструктивной миграции (D5) таблица пуста, и до первого PUT владельца
// GET и генератор слотов работают с дефолтом, ничего не записывая в БД —
// «из коробки» сервис уже бронировать можно, а решение владельца не
// подменяется сеянием строк за его спиной.

export type WorkingHoursDay = WorkingDayHours;

/** Дефолт D3: 0 — воскресенье … 6 — суббота (как `Date#getDay`). */
export const DEFAULT_WORKING_HOURS: readonly WorkingHoursDay[] = [
  { weekday: 0, isDayOff: true, startMinutes: 0, endMinutes: 0 },
  { weekday: 1, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 2, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 3, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 4, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 5, isDayOff: false, startMinutes: 9 * 60, endMinutes: 18 * 60 },
  { weekday: 6, isDayOff: true, startMinutes: 0, endMinutes: 0 },
];

/** День в JSON-форме контракта: у выходного минуты не нужны (models.tsp). */
export interface WorkingHoursDayJson {
  weekday: number;
  isDayOff: boolean;
  startMinutes?: number;
  endMinutes?: number;
}

export function serializeWorkingHoursDay(day: WorkingHoursDay): WorkingHoursDayJson {
  if (day.isDayOff) {
    return { weekday: day.weekday, isDayOff: true };
  }
  return {
    weekday: day.weekday,
    isDayOff: false,
    startMinutes: day.startMinutes,
    endMinutes: day.endMinutes,
  };
}

/**
 * Текущие рабочие часы: строки таблицы по возрастанию дня недели; пустая
 * таблица → дефолт D3 в памяти (без записи в БД).
 */
export async function getWorkingHours(): Promise<WorkingHoursDay[]> {
  const db = await getDb();

  const rows = await db.workingHours.findMany({ orderBy: { weekday: 'asc' } });
  if (rows.length === 0) {
    return DEFAULT_WORKING_HOURS.map((day) => ({ ...day }));
  }
  return rows.map((row) => ({
    weekday: row.weekday,
    isDayOff: row.isDayOff,
    startMinutes: row.startMinutes,
    endMinutes: row.endMinutes,
  }));
}

/**
 * Полная замена часов недели (PUT): 7 валидированных дней пишутся одной
 * транзакцией — deleteMany + createMany, частичных обновлений нет.
 */
export async function putWorkingHours(days: WorkingHoursDay[]): Promise<WorkingHoursDay[]> {
  const db = await getDb();

  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  await db.$transaction([
    db.workingHours.deleteMany({}),
    db.workingHours.createMany({
      data: sorted.map((day) => ({
        weekday: day.weekday,
        startMinutes: day.startMinutes,
        endMinutes: day.endMinutes,
        isDayOff: day.isDayOff,
      })),
    }),
  ]);
  return sorted;
}
