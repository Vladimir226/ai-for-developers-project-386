import { expect, test } from '@playwright/test';

// Проба связки (process.md «проба перед дизайном»): webServer поднимает
// собранное приложение с временной БД, браузер ходит на нестандартный порт.
//
// Полный браузерный сценарий по контракту v2 — e2e/booking-flow.spec.ts
// (#37): выбор типа → календарь → бронь → конфликт занятости. Здесь —
// инфраструктурный дым: страницы отвечают 200, health — {"status":"ok"};
// /admin — живая панель владельца (#34): типы событий и рабочие часы
// читаются self-fetch'ем, поэтому заголовки секций — рендер серверных
// данных; секция «Брони» (#36) — предстоящие встречи всех типов
// (?upcoming=true), на свежей базе — пустое состояние, отмена — вне smoke.

test('публичная страница отвечает 200', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Панель владельца' })).toBeVisible();
  // навигация на «Предстоящие записи» (#57)
  await expect(page.getByRole('link', { name: 'Предстоящие записи' })).toBeVisible();
});

test('панель владельца отвечает 200 и показывает секции', async ({ page }) => {
  const response = await page.goto('/admin');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Панель владельца' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Новый тип события' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Рабочие часы' })).toBeVisible();
  // секция «Брони» (#36): рендер серверных данных self-fetch'ем; на свежей
  // базе — пустое состояние «Предстоящих броней нет»
  await expect(page.getByRole('heading', { name: 'Брони' })).toBeVisible();
  await expect(page.getByText('Предстоящих броней нет')).toBeVisible();
});

test('GET /api/health отвечает {"status":"ok"}', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('«Предстоящие записи» отвечают 200 и показывают пустое состояние', async ({ page }) => {
  // публичный список броней всех гостей (#57, ADR-0012): серверный рендер
  // self-fetch'ем, на свежей базе — пустое состояние с CTA на публичную
  // страницу; отмена и карточки — в booking-flow.spec.ts
  const response = await page.goto('/bookings');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Предстоящие записи' })).toBeVisible();
  await expect(page.getByText('Предстоящих звонков нет')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Записаться на звонок' })).toBeVisible();
});
