import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  calendarDayButton,
  expectSlotNotFree,
  fillPublishRow,
  findSlotByWall,
  slotTimeLabel,
  wallDateKeyFromNow,
  wallToUtcIso,
} from './helpers';

// E2e-сценарий из архитектуры (NFR-003, тикет #9): владелец публикует
// интервал на /admin → посетитель видит его на / → бронирует → слот исчезает
// из свободных; повторная бронь того же слота даёт понятную ошибку в UI.
// Один webServer и одна временная БД на прогон (workers: 1), тесты сеют
// интервалы на разных днях, чтобы клетки календаря не мешали друг другу.

/** День основного сценария: +5 суток, середина дня — без пересечения полночи. */
const FLOW_DAY = () => wallDateKeyFromNow(5);
const FLOW_START = '15:10';
const FLOW_END = '15:40';

/** День сценария повторной брони: +7 суток, другой день и время. */
const RIVAL_DAY = () => wallDateKeyFromNow(7);
const RIVAL_START = '12:00';
const RIVAL_END = '12:30';

/** Запасной день (+9): держит календарь непустым, пока цель сценария занята. */
const SPARE_DAY = () => wallDateKeyFromNow(9);
const SPARE_START = '13:00';
const SPARE_END = '13:30';

/** Сеет свободный слот через API и возвращает его по контракту. */
async function seedSlot(request: APIRequestContext, day: string, start: string, end: string) {
  const created = await request.post('/api/v1/slots', {
    data: { startsAt: wallToUtcIso(day, start), endsAt: wallToUtcIso(day, end) },
  });
  expect(created.status(), `сеяние слота ${day} ${start}`).toBe(201);
  return findSlotByWall(request, day, start);
}

test.describe('публикация → бронирование → слот исчез', () => {
  test('владелец публикует интервал, посетитель бронирует, слот исчезает из свободных', async ({
    page,
    request,
  }) => {
    const day = FLOW_DAY();

    // 1. Владелец публикует интервал через форму /admin
    await page.goto('/admin');
    await fillPublishRow(page, day, FLOW_START, FLOW_END);
    await page.getByRole('button', { name: 'Опубликовать интервалы' }).click();
    await expect(page.getByRole('status')).toContainText('Опубликовано: 1 интервал');

    // интервал появился в списке админа со свежим бейджем «Свободен»
    const publishedList = page.locator('section[aria-label="Опубликованные интервалы"]');
    await expect(publishedList).toContainText(`· ${FLOW_START}–${FLOW_END}`);
    await expect(publishedList.getByText('Свободен')).toBeVisible();

    // 2. Слот есть в API; id и метки читаем из ответа, а не из головы
    const slot = await findSlotByWall(request, day, FLOW_START);
    const timeLabel = slotTimeLabel(slot.startsAt, slot.endsAt);

    // 3. Посетитель видит окно на публичной странице
    await page.goto('/');
    const dayButton = await calendarDayButton(page, day, 'свободных окон: 1');
    await expect(dayButton).toBeVisible();
    await dayButton.click();
    const slotButton = page.locator('.slot-btn', { hasText: timeLabel });
    await expect(slotButton).toBeVisible();
    await slotButton.click();

    // 4. Бронирование
    await page.getByLabel('Ваше имя').fill('Мария');
    await page.getByLabel('Телефон или email').fill('+7 900 000-00-00');
    await page.getByLabel('Комментарий').fill('Хочу обсудить проект');
    await page.getByRole('button', { name: 'Забронировать звонок' }).click();
    const confirmed = page.locator('section[aria-label="Бронь подтверждена"]');
    await expect(confirmed).toBeVisible();
    await expect(confirmed).toContainText('Мария');
    await expect(confirmed).toContainText(timeLabel);

    // 5. Слот исчез из свободных: API + публичная страница
    await expectSlotNotFree(request, slot.id);
    await page.reload();
    const emptyDay = await calendarDayButton(page, day, 'свободных окон нет');
    await expect(emptyDay).toBeVisible();
    await expect(page.locator('section[aria-label="Нет свободных окон"]')).toBeVisible();

    // 6. Владелец видит бронь: бейдж «Забронирован» и карточка в «Бронях»
    await page.goto('/admin');
    const intervalRow = page.locator('section[aria-label="Опубликованные интервалы"] li', {
      hasText: `· ${FLOW_START}–${FLOW_END}`,
    });
    await expect(intervalRow).toBeVisible();
    await expect(intervalRow.getByText('Забронирован')).toBeVisible();

    const bookingsSection = page.locator('section[aria-label="Брони"]');
    await expect(bookingsSection).toContainText('1 активная');
    await expect(bookingsSection.getByText('Мария')).toBeVisible();
    await expect(
      bookingsSection.getByRole('button', { name: 'Отменить бронь: Мария,' }),
    ).toBeVisible();
  });

  test('повторная бронь того же слота — баннер «Это время только что заняли»', async ({
    page,
    request,
  }) => {
    const day = RIVAL_DAY();

    // цель сценария + запасное окно: баннер ошибки живёт только при непустом
    // календаре, поэтому запасной день не даёт ему исчезнуть после refresh
    const slot = await seedSlot(request, day, RIVAL_START, RIVAL_END);
    await seedSlot(request, SPARE_DAY(), SPARE_START, SPARE_END);

    // посетитель открыл форму на этом окне…
    await page.goto('/');
    const dayButton = await calendarDayButton(page, day, 'свободных окон: 1');
    await expect(dayButton).toBeVisible();
    await dayButton.click();
    await page.locator('.slot-btn', { hasText: slotTimeLabel(slot.startsAt, slot.endsAt) }).click();
    await page.getByLabel('Ваше имя').fill('Игорь');
    await page.getByLabel('Телефон или email').fill('igor@example.com');

    // …а до сабмита слот занял другой посетитель — это и есть повторная бронь
    const rivalBooking = await request.post('/api/v1/bookings', {
      data: {
        slotId: slot.id,
        bookerName: 'Другой посетитель',
        bookerContact: '+7 900 111-11-11',
      },
    });
    expect(rivalBooking.status(), 'первая бронь через API').toBe(201);

    await page.getByRole('button', { name: 'Забронировать звонок' }).click();
    // точечный локатор: role="alert" есть и у next-роут-анонсера
    await expect(page.getByRole('alert', { name: 'Ошибка бронирования' })).toContainText(
      'Это время только что заняли',
    );
    await expect(page.locator('section[aria-label="Окна на выбранный день"]')).toContainText(
      'На этот день свободных окон нет',
    );
    await expectSlotNotFree(request, slot.id);

    // прямой повтор через API — тот же занятый слот, честный 409 (ADR-005)
    const repeat = await request.post('/api/v1/bookings', {
      data: { slotId: slot.id, bookerName: 'Игорь', bookerContact: 'igor@example.com' },
    });
    expect(repeat.status(), 'повторная бронь занятого слота').toBe(409);
    expect(await repeat.json()).toMatchObject({ error: { code: 'SLOT_ALREADY_BOOKED' } });
  });
});

test.describe('мобильный viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('публичная страница и панель владельца отображаются без поломок', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Запишитесь');
    await expect(page.locator('section[aria-label="Календарь"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Панель владельца' })).toBeVisible();

    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Панель владельца');
    await expect(page.locator('section[aria-label="Новые интервалы"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Опубликованные интервалы"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Брони"]')).toBeVisible();

    // адаптивность: контент не шире экрана — без горизонтальной прокрутки
    for (const path of ['/', '/admin']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path}: без горизонтальной прокрутки`).toBeLessThanOrEqual(0);
    }
  });
});
