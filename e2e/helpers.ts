import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';
import { formatTimeRange } from '../src/lib/time/display';

// Хелперы e2e-сценария новой модели (шов 2, #37, аддендум №2 спеки): сеяние
// и проверки — через API настоящего сервера, подписи UI — зеркала чистой
// логики публичной страницы (booking-logic, lib/time/display), селекторы —
// по name/role/aria-label, без data-testid. Даты — только из ответов API
// относительно Date.now(): фиксированные календарные даты протухают. Зона —
// APP_TZ веб-сервера из playwright.config.ts (Europe/Moscow, ADR-009).

export const APP_TZ = 'Europe/Moscow';

/** Вычисляемый слот по контракту (ADR-0011): идентификатора нет, ключ — startsAt. */
export interface SlotJson {
  startsAt: string;
  endsAt: string;
}

/** Тип события — как его возвращает POST /api/v1/event-types. */
export interface EventTypeJson {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
}

/** Бронь — как её возвращает GET /api/v1/bookings. */
export interface BookingJson {
  id: string;
  eventType: { id: string; title: string; durationMinutes: number };
  startsAt: string;
  endsAt: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
}

// ── Сеяние и проверки через API ──────────────────────────────────────────────

/** Создаёт тип события (сеяние владельца) и возвращает его по контракту. */
export async function seedEventType(
  request: APIRequestContext,
  draft: { title: string; description?: string; durationMinutes: number },
): Promise<EventTypeJson> {
  const response = await request.post('/api/v1/event-types', { data: draft });
  expect(response.status(), `сеяние типа «${draft.title}»`).toBe(201);
  return (await response.json()) as EventTypeJson;
}

/** Свободные слоты типа — тот же ответ, на котором гость строит календарь. */
export async function freeSlots(request: APIRequestContext, typeId: string): Promise<SlotJson[]> {
  const response = await request.get(`/api/v1/event-types/${typeId}/slots`);
  expect(response.status(), 'GET свободных слотов типа').toBe(200);
  return ((await response.json()) as { slots: SlotJson[] }).slots;
}

/** Прямой POST брони — «второй гость», действующий вне браузера. */
export function postBooking(
  request: APIRequestContext,
  body: { eventTypeId: string; startsAt: string; bookerName: string; bookerContact: string },
): Promise<APIResponse> {
  return request.post('/api/v1/bookings', { data: body });
}

/**
 * Предстоящие брони владельца: раздел «Брони» админки — тикет #36, до его
 * мерджа предстоящая бронь проверяется списком по API.
 */
export async function upcomingBookings(request: APIRequestContext): Promise<BookingJson[]> {
  const response = await request.get('/api/v1/bookings?upcoming=true');
  expect(response.status(), 'GET /api/v1/bookings?upcoming=true').toBe(200);
  return ((await response.json()) as { bookings: BookingJson[] }).bookings;
}

// ── Подписи публичной страницы ───────────────────────────────────────────────

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

/** Подпись слота «10:00–10:30» — тот же формат, что рисует публичная страница. */
export function slotTimeLabel(slot: SlotJson): string {
  return formatTimeRange(slot.startsAt, slot.endsAt, APP_TZ);
}

// ── День со свободными окнами ────────────────────────────────────────────────

/** День календаря с его свободными слотами. */
export interface OpenDay {
  dateKey: string;
  slots: SlotJson[];
}

/** Группирует слоты по настенным дням APP_TZ — как buildBookingCalendar. */
export function groupSlotsByDay(slots: readonly SlotJson[]): OpenDay[] {
  const byDay = new Map<string, SlotJson[]>();
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (const slot of slots) {
    const key = dateKey.format(new Date(slot.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  return [...byDay.entries()].map(([dateKey, daySlots]) => ({ dateKey, slots: daySlots }));
}

/**
 * Первый хронологический день, где есть хотя бы minSlots свободных окон:
 * цель сценария читается из ответа API, а не из головы.
 */
export function firstDayWithSlots(slots: readonly SlotJson[], minSlots = 1): OpenDay | null {
  return groupSlotsByDay(slots).find((day) => day.slots.length >= minSlots) ?? null;
}

// ── Локаторы публичной страницы ──────────────────────────────────────────────

/** Секция «Окна на выбранный день»: заголовок дня и список слотов. */
export function slotsSection(page: Page): Locator {
  return page.locator('section[aria-label="Окна на выбранный день"]');
}

/** Кнопка слота по подписи «10:00–10:30» внутри списка выбранного дня. */
export function slotButton(page: Page, slot: SlotJson): Locator {
  return slotsSection(page).getByRole('button', { name: slotTimeLabel(slot) });
}

/**
 * Открывает день в календаре: подпись клетки — «вторник, 10 ноября, …» без
 * счётчика окон (после обновления списка счёт меняется). Оба сценария
 * открывают первый открытый день окна записи — он хронологически первый и
 * всегда в текущем месяце, листать месяцы не нужно.
 */
export async function openDay(page: Page, dateKey: string): Promise<void> {
  const title = dayTitle(dateKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(`^${title},`) }).click();
}
