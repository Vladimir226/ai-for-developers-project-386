import { expect, test } from '@playwright/test';

// Проба связки (process.md «проба перед дизайном»): webServer поднимает
// собранное приложение с временной БД, браузер ходит на нестандартный порт.
// Основные сценарии — в booking-flow.spec.ts.

test('связка webServer + браузер живая', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Панель владельца' })).toBeVisible();
});
