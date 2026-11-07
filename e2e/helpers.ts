import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { formatTimeRange } from '../src/lib/time/display';
import { wallTimeToUtcIso } from '../src/lib/time/wall-time';

// Хелперы e2e-прогона (шов 2, тикет #9). Даты — только относительно Date.now()
// и из ответов API: фиксированные календарные даты в тестах протухают. Зона —
// APP_TZ веб-сервера из playwright.config.ts (Europe/Moscow, ADR-009).

export const APP_TZ = 'Europe/Moscow';

/** Настенные части инстанта в зоне: 'ГГГГ-ММ-ДД' и 'ЧЧ:ММ'. */
export function wallParts(at: Date, timeZone = APP_TZ): { dateKey: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** Настенная дата через daysAhead суток в APP_TZ — «ГГГГ-ММ-ДД». */
export function wallDateKeyFromNow(daysAhead: number): string {
  return wallParts(new Date(Date.now() + daysAhead * 86_400_000)).dateKey;
}

/** Заголовок дня «вторник, 10 ноября» — зеркало dayTitle из booking-logic. */
export function dayTitle(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(Date.UTC(year, month - 1, day));
}

/** UTC-метка настенных даты/времени в APP_TZ — та же конвертация, что в UI. */
export function wallToUtcIso(dateKey: string, time: string): string {
  return wallTimeToUtcIso(dateKey, time, APP_TZ);
}

/** Подпись слота «15:10–15:40» — тот же формат, что рисует публичная страница. */
export function slotTimeLabel(startsAt: string, endsAt: string): string {
  return formatTimeRange(startsAt, endsAt, APP_TZ);
}

interface SlotJson {
  id: string;
  startsAt: string;
  endsAt: string;
}

async function getSlots(request: APIRequestContext, view: 'free' | 'all'): Promise<SlotJson[]> {
  const response = await request.get(`/api/v1/slots?view=${view}`);
  expect(response.ok(), `GET /api/v1/slots?view=${view} должен быть успешным`).toBeTruthy();
  return ((await response.json()) as { slots: SlotJson[] }).slots;
}

/** Ищет в view=all слот по настенным дате и времени начала; даты — из API. */
export async function findSlotByWall(
  request: APIRequestContext,
  dateKey: string,
  startTime: string,
): Promise<SlotJson> {
  const found = (await getSlots(request, 'all')).find((slot) => {
    const parts = wallParts(new Date(slot.startsAt));
    return parts.dateKey === dateKey && parts.time === startTime;
  });
  expect(found, `слот ${dateKey} ${startTime} должен быть опубликован`).toBeDefined();
  return found as SlotJson;
}

/** Проверяет, что слота нет среди свободных будущих (view=free). */
export async function expectSlotNotFree(request: APIRequestContext, slotId: string) {
  const free = await getSlots(request, 'free');
  expect(
    free.map((s) => s.id),
    'слот должен исчезнуть из view=free',
  ).not.toContain(slotId);
}

/**
 * Клетка дня в календаре публичной страницы: листает месяцы, если день в
 * следующем месяце (окно — сегодня + 31 день, максимум 2 месяца).
 */
export async function calendarDayButton(
  page: Page,
  dateKey: string,
  windowState: 'свободных окон: 1' | 'свободных окон нет',
): Promise<Locator> {
  const button = page.getByRole('button', { name: `${dayTitle(dateKey)}, ${windowState}` });
  const nextMonth = page.getByRole('button', { name: 'Следующий месяц' });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await button.isVisible()) return button;
    if (!(await nextMonth.isEnabled())) break;
    await nextMonth.click();
  }
  return button; // ассершен видимости на вызывающем коде даст понятную ошибку
}

/** Заполняет первую строку формы публикации интервала на /admin. */
export async function fillPublishRow(
  page: Page,
  dateKey: string,
  start: string,
  end: string,
): Promise<void> {
  await page.locator('input[name="row-date"]').fill(dateKey);
  await page.locator('input[name="row-start"]').fill(start);
  await page.locator('input[name="row-end"]').fill(end);
}
