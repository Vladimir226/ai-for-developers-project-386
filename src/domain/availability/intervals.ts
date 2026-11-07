// Доменный модуль availability (architecture.md §4): правила интервалов.
// Чистые функции без зависимости от БД — тестируются unit-тестами (шов 3).

/** Полуинтервал [startsAt; endsAt): начало включено, конец — нет (ADR-008). */
export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Пересекаются ли два полуинтервала. Вплотную соседние интервалы
 * (конец одного == начало другого) пересечением не считаются.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
