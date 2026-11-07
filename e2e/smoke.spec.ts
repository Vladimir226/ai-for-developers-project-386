import { expect, test } from '@playwright/test';

// Проба связки (process.md «проба перед дизайном»): webServer поднимает
// собранное приложение с временной БД, браузер ходит на нестандартный порт.
//
// Промежуточное состояние (ADR-0011, #32): доменных API-эндпоинтов и
// интерактивного UI временно нет — сервер и браузерный сценарий по новому
// контракту вернутся в #33/#37. Пока честно зелёное — только каркас:
// страница отвечает 200, инфраструктурный health — {"status":"ok"}.

test('публичная страница отвечает 200', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Панель владельца' })).toBeVisible();
});

test('GET /api/health отвечает {"status":"ok"}', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
