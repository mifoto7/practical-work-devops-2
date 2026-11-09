import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/data-comparison.json', JSON.stringify({ database, api }, null, 2));
  expect(api, 'Ответ API должен совпадать со всеми записями SQL, включая id и name').toEqual(database);
});

test('Все записи из PostgreSQL совпадают с отображением в веб-интерфейсе', async ({ page }, testInfo) => {
  const database = databaseItems();
  expect(database.length).toBeGreaterThan(0);
  const expected = database.map(item => `#${item.id} — ${item.name}`);
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  try {
    await expect(page.locator('#items li')).toHaveText(expected);
    await expect(page.locator('#error')).toBeEmpty();
  } finally {
    mkdirSync('test-results', { recursive: true });
    const comparison = existsSync('test-results/data-comparison.json')
      ? JSON.parse(readFileSync('test-results/data-comparison.json', 'utf8')) : {};
    comparison.databaseAtBrowserCheck = database;
    comparison.expectedDisplay = expected;
    comparison.actualDisplay = await page.locator('#items li').allTextContents();
    writeFileSync('test-results/data-comparison.json', JSON.stringify(comparison, null, 2));
    await page.screenshot({ path: 'test-results/web-interface.png', fullPage: true });
    await testInfo.attach('Сравнение SQL и страницы', { path: 'test-results/data-comparison.json', contentType: 'application/json' });
    await testInfo.attach('Веб-интерфейс', { path: 'test-results/web-interface.png', contentType: 'image/png' });
  }
});
