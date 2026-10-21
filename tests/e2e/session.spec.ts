import { expect, test } from '@playwright/test';
import { cards, FIXTURES, formField, loads, mockApi, reachLiveResults, uploadedImageSize } from './support.ts';

test('17 · "Borrar sesión" erases photos, answers and results', async ({ page }) => {
  await mockApi(page);
  await reachLiveResults(page);
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Fotos' }).click();
  const photoUrl = await page.getByTestId('slot-frontal').locator('img').getAttribute('src');
  expect(await loads(page, photoUrl!)).toBe(true);

  await page.getByRole('button', { name: 'Borrar sesión' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Borrar esta sesión?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Borrar fotos y respuestas' }).click();

  await expect(page).toHaveURL(/\/stylist\/?$/);
  await expect(page.getByText(/Sesión borrada/)).toBeVisible();
  // The photos are gone from memory, not just from the screen.
  expect(await loads(page, photoUrl!)).toBe(false);

  await page.getByRole('link', { name: 'Empezar', exact: true }).click();
  await expect(page.getByTestId('slot-frontal').locator('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Borrar sesión' })).toBeDisabled();
  // Client-side navigation (no reload) to the results: nothing is left.
  await page.evaluate(() => {
    history.pushState(null, '', `${location.pathname.replace(/fotos$/, 'resultados')}`);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No hay resultados en esta sesión');
});

test('the dialog can be cancelled without losing anything', async ({ page }) => {
  await mockApi(page);
  await page.goto('estudio/fotos');
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.jpg`);
  await page.getByRole('button', { name: 'Borrar sesión' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('slot-frontal').locator('img')).toBeVisible();
});

test('nothing is written to browser storage, cookies or IndexedDB', async ({ page, context }) => {
  await mockApi(page);
  await reachLiveResults(page);
  await cards(page).first().getByRole('button', { name: 'Guardar' }).click();
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: 'caches' in window ? (await caches.keys()).length : 0,
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: 0, caches: 0 });
  expect(await context.cookies()).toEqual([]);
});

test('AI preview: separate consent naming the service, labelled result, deletable', async ({ page }) => {
  const log = await mockApi(page);
  await reachLiveResults(page);
  const first = cards(page).first();
  await first.getByRole('button', { name: 'Ver cómo te queda' }).click();

  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tus fotos' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('se envían a Cloudflare');
  await expect(dialog).toContainText('modelo image-test-model');
  await expect(dialog).toContainText('no conserva lo que recibe ni lo que genera');
  await expect(dialog.getByRole('button', { name: 'Aceptar y generar' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Las fotos son mías y acepto enviarlas a Cloudflare/ }).check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();

  // Both views: the frontal and the profile photo, each with the cut.
  await expect(first.getByRole('img', { name: /Simulación generada por IA de tu foto de frente con Crop texturizado/ })).toBeVisible();
  await expect(first.getByRole('img', { name: /Simulación generada por IA de tu foto de perfil con Crop texturizado/ })).toBeVisible();
  await expect(first.getByText('Simulación con IA · de frente')).toBeVisible();
  await expect(first.getByText(/Imágenes generadas con IA \(image-test-model\)/)).toBeVisible();
  expect(log.preview).toHaveLength(2);
  expect(log.preview.map((request) => formField(request, 'view')).sort()).toEqual(['front', 'profile']);
  for (const request of log.preview) {
    expect(formField(request, 'styleId')).toBe('textured-crop');
    expect(formField(request, 'consent')).toBe('accepted');
    // One photo per request, reduced to 512 px for Cloudflare.
    const size = uploadedImageSize(request, 'photo');
    expect(Math.max(size!.width, size!.height)).toBeLessThanOrEqual(512);
  }

  // The consent covers the session: the next preview starts straight away.
  const second = cards(page).nth(1);
  await second.getByRole('button', { name: 'Ver cómo te queda' }).click();
  await expect(second.getByRole('img', { name: /Simulación generada por IA de tu foto de perfil/ })).toBeVisible();
  await expect(dialog).toBeHidden();

  // On the detail sheet, each original beside its simulation, downloadable and deletable.
  await first.getByRole('link', { name: 'Ver ficha' }).click();
  await expect(page.getByRole('img', { name: 'Tu foto de frente, sin cambios' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Tu foto de perfil, sin cambios' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Descargar' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Borrar simulaciones' }).click();
  await expect(page.getByRole('img', { name: /Simulación generada por IA/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver cómo te queda' })).toBeVisible();
});

test('AI preview errors are shown and the panel recovers', async ({ page }) => {
  await mockApi(page, {
    preview: {
      status: 429,
      body: { type: 'error', code: 'rate_limited', message: 'Has alcanzado el límite de 10 vistas previas por hora.', retryable: true },
    },
  });
  await reachLiveResults(page);
  const first = cards(page).first();
  await first.getByRole('button', { name: 'Ver cómo te queda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tus fotos' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();
  await expect(first.getByRole('alert')).toHaveText('Has alcanzado el límite de 10 vistas previas por hora.');
  await expect(first.getByRole('button', { name: 'Ver cómo te queda' })).toBeEnabled();
});

test('without an image service, the preview is said to be unavailable once', async ({ page }) => {
  await mockApi(page, { health: 'no_preview' });
  await reachLiveResults(page);
  await expect(page.getByText('La simulación de cómo te queda cada corte no está activada en el servidor de esta publicación.')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ver cómo te queda' })).toHaveCount(0);
});

test('replacing the frontal photo discards the previews made from it', async ({ page }) => {
  await mockApi(page);
  await reachLiveResults(page);
  const first = cards(page).first();
  await first.getByRole('button', { name: 'Ver cómo te queda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tus fotos' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();
  await expect(first.getByRole('img', { name: /Simulación generada por IA/ })).toHaveCount(2);

  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Fotos' }).click();
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.webp`);
  await expect(page.getByTestId('slot-frontal').getByText('Lista')).toBeVisible();
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Resultados' }).click();
  await expect(page.getByRole('img', { name: /Simulación generada por IA de tu foto de frente/ })).toHaveCount(0);
  // The profile simulation was made from the unchanged profile photo, so it stays.
  await expect(page.getByRole('img', { name: /Simulación generada por IA de tu foto de perfil/ })).toHaveCount(1);
});

test('"Ver un ejemplo" shows a demo without any photo', async ({ page }) => {
  const log = await mockApi(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Ver un ejemplo' }).first().click();
  await expect(page).toHaveURL(/estudio\/resultados$/);
  await expect(page.getByText('Modo demostración · no se ha analizado ninguna foto')).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
  // No photo, so no preview offer either.
  await expect(page.getByRole('button', { name: 'Ver cómo te queda' })).toHaveCount(0);
  expect(log.analyze).toHaveLength(0);
});

test('with Google as the image service, the consent names Google and its retention', async ({ page }) => {
  const log = await mockApi(page, { previewProvider: 'google' });
  await reachLiveResults(page);
  await cards(page).first().getByRole('button', { name: 'Ver cómo te queda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tus fotos' });
  await expect(dialog).toContainText('se envían a Google');
  await expect(dialog).toContainText('55 días');
  await dialog.getByRole('checkbox', { name: /acepto enviarlas a Google/ }).check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();
  await expect(
    cards(page)
      .first()
      .getByText(/SynthID/),
  ).toBeVisible();
  // Google gets the photos at their prepared size.
  const front = log.preview.find((request) => formField(request, 'view') === 'front')!;
  expect(uploadedImageSize(front, 'photo')).toMatchObject({ width: 1200, height: 1500 });
});
