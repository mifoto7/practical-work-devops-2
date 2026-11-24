import { test, expect } from '@playwright/test';
import { databaseItems } from '../scripts/docker.mjs';

test('Приложение работает и получает реальные записи из PostgreSQL', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: 'ok', database: 'connected' });

  const database = databaseItems();
  expect(database.length, 'В БД должны быть начальные записи из init/01_seed.sql').toBeGreaterThan(0);
  const response = await request.get('/api/items');
  expect(response.ok()).toBeTruthy();
  const api = await response.json();
  expect(api, 'Ответ API должен совпадать со всеми записями SQL, включая id и name').toEqual(database);
});

test('Все записи из PostgreSQL совпадают с отображением в веб-интерфейсе', async ({ page }) => {
  const database = databaseItems();
  expect(database.length).toBeGreaterThan(0);
  const expected = database.map(item => `#${item.id} — ${item.name}`);
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#items li')).toHaveText(expected);
  await expect(page.locator('#error')).toBeEmpty();
});
