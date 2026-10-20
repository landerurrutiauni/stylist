import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { oversizedJpeg } from './images.ts';
import { FIXTURES, loads, mockApi, uploadPhotos, watchErrors } from './support.ts';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('estudio/fotos');
});

const continueButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Continuar' });

test('1 · accepts both photos and lets the person continue', async ({ page }) => {
  const errors = watchErrors(page);
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByText('Faltan las dos fotos.')).toBeVisible();
  await uploadPhotos(page);
  await expect(page.getByTestId('slot-frontal').getByText('Lista')).toBeVisible();
  await expect(page.getByTestId('slot-profile').getByText('Lista')).toBeVisible();
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();
  await expect(page).toHaveURL(/estudio\/consentimiento$/);
  expect(errors).toEqual([]);
});

test('2 · without the frontal photo it cannot continue', async ({ page }) => {
  await page.getByTestId('input-profile').setInputFiles(`${FIXTURES}/profile.jpg`);
  await expect(page.getByTestId('slot-profile').locator('img')).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByText('Falta la foto de frente.')).toBeVisible();
  // The consent screen sends the person back as well.
  await page.goto('estudio/consentimiento');
  await expect(page).toHaveURL(/estudio\/fotos$/);
});

test('3 · without the profile photo it cannot continue', async ({ page }) => {
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.jpg`);
  await expect(page.getByTestId('slot-frontal').locator('img')).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByText('Falta la foto de perfil.')).toBeVisible();
});

test('4 · rejects files that are not JPEG, PNG or WebP, whatever their name', async ({ page }) => {
  const slot = page.getByTestId('slot-frontal');
  await page
    .getByTestId('input-frontal')
    .setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('GIF89a, not a photo at all') });
  await expect(slot.getByRole('alert')).toHaveText('Ese archivo no es una imagen JPEG, PNG ni WebP.');
  await expect(slot.locator('img')).toHaveCount(0);

  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
  await page.getByTestId('input-frontal').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic });
  await expect(slot.getByRole('alert')).toContainText('Es una foto HEIC');
  await expect(continueButton(page)).toBeDisabled();
});

test('5 · rejects files over 15 MB before reading them', async ({ page }) => {
  await page.getByTestId('input-profile').setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: oversizedJpeg() });
  await expect(page.getByTestId('slot-profile').getByRole('alert')).toHaveText('La imagen pesa 16.0 MB y el máximo es 15 MB.');
});

test('rejects photos too small to read a face', async ({ page }) => {
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/small.jpg`);
  await expect(page.getByTestId('slot-frontal').getByRole('alert')).toContainText('La imagen mide 300 × 375 px');
});

test('blocks a photo that is too dark and warns about a blurred one', async ({ page }) => {
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/dark.jpg`);
  const frontal = page.getByTestId('slot-frontal');
  await expect(frontal.getByText('No se puede usar')).toBeVisible();
  await expect(frontal.getByText(/tan oscura que no se distingue/)).toBeVisible();
  await page.getByTestId('input-profile').setInputFiles(`${FIXTURES}/profile.jpg`);
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByText('Sustituye la foto que no se puede usar.')).toBeVisible();

  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/blurry.jpg`);
  await expect(frontal.getByText('Revísala')).toBeVisible();
  await expect(frontal.getByText(/desenfocada o movida/)).toBeVisible();
  await expect(continueButton(page)).toBeEnabled();
});

test('6 · deletes and replaces a photo, releasing the old one', async ({ page }) => {
  await uploadPhotos(page);
  const frontal = page.getByTestId('slot-frontal');
  const firstUrl = await frontal.locator('img').getAttribute('src');
  expect(firstUrl).toMatch(/^blob:/);
  expect(await loads(page, firstUrl!)).toBe(true);

  await frontal.getByRole('button', { name: 'Eliminar' }).click();
  await expect(frontal.locator('img')).toHaveCount(0);
  await expect(frontal.getByText('Pendiente')).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();
  // The removed photo no longer exists in memory.
  expect(await loads(page, firstUrl!)).toBe(false);

  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.webp`);
  await expect(frontal.locator('img')).toBeVisible();
  const secondUrl = await frontal.locator('img').getAttribute('src');
  // "Sustituir" swaps it again.
  await expect(frontal.getByText('Sustituir')).toBeVisible();
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.jpg`);
  await expect(frontal.locator('img')).not.toHaveAttribute('src', secondUrl!);
  await expect(continueButton(page)).toBeEnabled();
});

test('resizes large photos to 1600 px on the long side', async ({ page }) => {
  const big = await sharp(`${FIXTURES}/frontal.jpg`).resize(2400, 3000).jpeg().toBuffer();
  await page.getByTestId('input-profile').setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: big });
  const resized = page.getByTestId('slot-profile').locator('img');
  await expect(resized).toBeVisible();
  expect(await resized.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([1280, 1600]);
});
