import { expect, test } from '@playwright/test';
import {
  dayTitle,
  firstDayWithSlots,
  freeSlots,
  openDay,
  postBooking,
  seedEventType,
  slotButton,
  slotTimeLabel,
  slotsSection,
  upcomingBookings,
} from './helpers';

// Браузерный сценарий шва 2 по новой модели (аддендум №2 спеки, #37):
// гость выбирает тип события → календарь 14 дат → слот → форма →
// «Бронь подтверждена» → слот исчезает из свободных. Второй тест —
// конкурентное занятие окна (D12): соперник бронирует то же время прямым
// POST до отправки формы, проигравший видит баннер «Это время только что
// заняли» и обновлённый список без слота.
//
// Сервер настоящий, без подмен API (D7); один webServer и одна временная
// БД на прогон (workers: 1), порядок тестов не важен: основной сценарий
// бронирует первый слот первого открытого дня, конкурентный — последний
// слот своего первого открытого дня, интервалы тестов не налагаются.

test.describe('выбор типа → календарь → слот → бронь', () => {
  test('гость бронирует «Созвон 30», слот исчезает из свободных, бронь видна владельцу', async ({
    page,
    request,
  }) => {
    // сеяние владельца: два вида брони разной длительности
    const call30 = await seedEventType(request, {
      title: 'Созвон 30',
      description: 'Короткий созвон один на один',
      durationMinutes: 30,
    });
    await seedEventType(request, {
      title: 'Разбор 60',
      description: 'Подробный разбор проекта',
      durationMinutes: 60,
    });

    // цель сценария — из ответа API: первый день со свободными окнами типа
    const day = firstDayWithSlots(await freeSlots(request, call30.id));
    expect(day, 'в окне 14 дней у нового типа должны быть свободные дни').not.toBeNull();
    const slot = day!.slots[0];
    const label = slotTimeLabel(slot);

    // 1. Шаг «виды брони»: карточки обоих типов с длительностью
    await page.goto('/');
    const typesSection = page.locator('section[aria-label="Виды брони"]');
    await expect(typesSection.getByRole('heading', { name: 'Созвон 30' })).toBeVisible();
    await expect(typesSection.getByRole('heading', { name: 'Разбор 60' })).toBeVisible();
    await expect(typesSection.getByText('30 минут')).toBeVisible();
    await expect(typesSection.getByText('1 час')).toBeVisible();

    // 2. Выбор типа → календарь окна записи (14 дат)
    await typesSection.getByRole('button', { name: /Созвон 30/ }).click();
    const calendar = page.locator('section[aria-label="Календарь"]');
    await expect(calendar).toBeVisible();
    await expect(calendar.getByText('окна на 14 дней вперёд')).toBeVisible();

    // 3. День со свободными окнами → слот
    await openDay(page, day!.dateKey);
    await expect(
      slotsSection(page).getByRole('heading', { name: dayTitle(day!.dateKey) }),
    ).toBeVisible();
    await slotButton(page, slot).click();

    // 4. Форма: имя, контакт, комментарий
    await page.getByLabel('Ваше имя').fill('Мария');
    await page.getByLabel('Телефон или email').fill('+7 900 000-00-00');
    await page.getByLabel('Комментарий').fill('Хочу обсудить проект');
    await page.getByRole('button', { name: 'Забронировать звонок' }).click();

    // 5. Подтверждение с деталями брони
    const confirmed = page.locator('section[aria-label="Бронь подтверждена"]');
    await expect(confirmed).toBeVisible();
    await expect(confirmed).toContainText('Созвон 30');
    await expect(confirmed).toContainText(dayTitle(day!.dateKey));
    await expect(confirmed).toContainText(label);
    await expect(confirmed).toContainText('Мария');

    // 6. Слот исчез из свободных: возврат к бронированию перечитывает список
    const reload = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes(`/api/v1/event-types/${call30.id}/slots`),
    );
    await confirmed.getByRole('button', { name: 'Забронировать ещё' }).click();
    await reload; // дожидаемся перечитанного списка, а не состояния по часам
    await expect(slotsSection(page)).toBeVisible();
    await expect(slotButton(page, slot)).toHaveCount(0);
    // сервер больше не предлагает это время гостям
    expect((await freeSlots(request, call30.id)).map((item) => item.startsAt)).not.toContain(
      slot.startsAt,
    );

    // 7. Владелец видит предстоящую бронь: раздел «Брони» админки — тикет
    //    #36, в этой ветке ещё не смержен — проверка списком по API
    const mine = (await upcomingBookings(request)).find(
      (booking) => booking.startsAt === slot.startsAt,
    );
    expect(mine).toMatchObject({
      bookerName: 'Мария',
      bookerContact: '+7 900 000-00-00',
      comment: 'Хочу обсудить проект',
      eventType: { id: call30.id, title: 'Созвон 30', durationMinutes: 30 },
    });
  });

  test('конкурентное занятие: соперник успел раньше — баннер «Это время только что заняли», слот пропадает', async ({
    page,
    request,
  }) => {
    const type = await seedEventType(request, {
      title: 'Планёрка 30',
      description: 'Быстрая планёрка команды',
      durationMinutes: 30,
    });

    // цель — последний слот первого открытого дня: не пересекается с
    // основным сценарием (там первый слот своего дня, интервалы тестов
    // не налагаются — D12), а после брони соперника окно гарантированно
    // исчезает из списка этого дня
    const day = firstDayWithSlots(await freeSlots(request, type.id));
    expect(day, 'в окне 14 дней у нового типа должны быть свободные дни').not.toBeNull();
    const slot = day!.slots[day!.slots.length - 1];
    const label = slotTimeLabel(slot);

    // гость A дошёл до формы с выбранным окном
    await page.goto('/');
    await page
      .locator('section[aria-label="Виды брони"]')
      .getByRole('button', { name: /Планёрка 30/ })
      .click();
    await openDay(page, day!.dateKey);
    await slotButton(page, slot).click();
    const form = page.locator('section[aria-label="Форма бронирования"]');
    await expect(form).toContainText(label);
    await page.getByLabel('Ваше имя').fill('Пётр');
    await page.getByLabel('Телефон или email').fill('+7 911 111-11-11');

    // гость B бронирует то же окно прямым POST и успевает первым
    const rival = await postBooking(request, {
      eventTypeId: type.id,
      startsAt: slot.startsAt,
      bookerName: 'Ольга',
      bookerContact: 'email:olga@b.co',
    });
    expect(rival.status(), 'соперник должен успеть первым').toBe(201);

    // гость A отправляет форму → 409 → баннер конфликта
    const reload = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes(`/api/v1/event-types/${type.id}/slots`),
    );
    await page.getByRole('button', { name: 'Забронировать звонок' }).click();
    const banner = page.locator('section[aria-label="Ошибка бронирования"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Это время только что заняли');
    await expect(page.locator('section[aria-label="Бронь подтверждена"]')).toHaveCount(0);
    await reload; // 409 перечитывает список — ждём его, а не спим

    // слот пропал из перечитанного списка (автоповтор сам дождётся свежего
    // рендера); баннер живёт и после обновления списка, форма готова к
    // выбору другого окна
    await expect(slotButton(page, slot)).toHaveCount(0);
    await expect(banner).toBeVisible();
    await expect(page.locator('section[aria-label="Форма бронирования"]')).toBeVisible();

    // и по API окно больше никому не предлагается
    expect((await freeSlots(request, type.id)).map((item) => item.startsAt)).not.toContain(
      slot.startsAt,
    );
  });
});
