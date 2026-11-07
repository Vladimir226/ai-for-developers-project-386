import { expect, test } from '@playwright/test';

// Проба связки (process.md «проба перед дизайном»): webServer поднимает
// собранное приложение с временной БД, браузер ходит на нестандартный порт.
//
// Промежуточное состояние (ADR-0011, #32): полного браузерного сценария по
// новому контракту нет — он вернётся в #37 после UI гостя (#35) и списка
// броней (#36). Пока честно зелёное — каркас: страницы отвечают 200,
// инфраструктурный health — {"status":"ok"}; /admin теперь живая панель
// владельца (#34): типы событий и рабочие часы читаются self-fetch'ем, поэтому
// заголовки секций — рендер серверных данных.

test('публичная страница отвечает 200', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Панель владельца' })).toBeVisible();
});

test('панель владельца отвечает 200 и показывает секции', async ({ page }) => {
  const response = await page.goto('/admin');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Панель владельца' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Новый тип события' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Рабочие часы' })).toBeVisible();
});

test('GET /api/health отвечает {"status":"ok"}', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
