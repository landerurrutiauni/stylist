import { expect, test } from '@playwright/test';
import { answerRequired, cards, mockApi, overflowsX, startLive } from './support.ts';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('18 · the whole flow works at 390 px without sideways scrolling', async ({ page }) => {
  expect(page.viewportSize()?.width).toBe(390);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await overflowsX(page)).toBe(false);
  await page.mouse.wheel(0, 4000);
  expect(await overflowsX(page)).toBe(false);

  await startLive(page);
  expect(await overflowsX(page)).toBe(false);
  // Option targets are comfortable to tap.
  const option = await page.locator('.option').first().boundingBox();
  expect(option!.height).toBeGreaterThanOrEqual(44);
  await answerRequired(page);
  expect(await overflowsX(page)).toBe(false);
  await page.getByRole('button', { name: 'Analizar mis fotos' }).tap();
  await expect(cards(page).first()).toBeVisible();
  expect(await overflowsX(page)).toBe(false);

  // Cards stack in one column and fit the screen.
  const box = await cards(page).first().boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.getByRole('tab', { name: /Largo/ }).tap();
  await expect(cards(page)).toHaveCount(2);

  await cards(page).first().getByRole('link', { name: 'Ver ficha' }).tap();
  await expect(page.getByRole('heading', { name: 'Qué pedir en la peluquería' })).toBeVisible();
  expect(await overflowsX(page)).toBe(false);
});

test('the photo screen offers the camera and stays inside the screen', async ({ page }) => {
  await page.goto('estudio/fotos');
  expect(await overflowsX(page)).toBe(false);
  await expect(page.getByTestId('slot-frontal').getByText('Hacer foto')).toBeVisible();
  await expect(page.getByTestId('slot-frontal').getByText('Elegir foto')).toBeVisible();
});

test('the step bar and erase action fit a phone', async ({ page }) => {
  await page.goto('estudio/fotos');
  const reset = await page.getByRole('button', { name: 'Borrar sesión' }).boundingBox();
  expect(reset!.x + reset!.width).toBeLessThanOrEqual(390);
  await page.goto('privacidad');
  expect(await overflowsX(page)).toBe(false);
});
