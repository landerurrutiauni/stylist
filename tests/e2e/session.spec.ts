import { expect, test } from '@playwright/test';
import { cards, FIXTURES, formField, loads, mockApi, reachLiveResults } from './support.ts';

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

test('AI preview: separate consent naming Google, labelled result, deletable', async ({ page }) => {
  const log = await mockApi(page);
  await reachLiveResults(page);
  const first = cards(page).first();
  await first.getByRole('button', { name: 'Ver cómo te queda' }).click();

  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tu foto' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('se envían a Google');
  await expect(dialog).toContainText('modelo image-test-model');
  await expect(dialog.getByRole('button', { name: 'Aceptar y generar' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /La foto es mía y acepto enviarla a Google/ }).check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();

  const image = first.getByRole('img', { name: /Simulación generada por IA de tu foto frontal con Crop texturizado/ });
  await expect(image).toBeVisible();
  await expect(first.getByText('Simulación con IA')).toBeVisible();
  await expect(first.getByText(/Imagen generada con IA \(image-test-model\)/)).toBeVisible();
  expect(log.preview).toHaveLength(1);
  expect(formField(log.preview[0]!, 'styleId')).toBe('textured-crop');
  expect(formField(log.preview[0]!, 'consent')).toBe('accepted');
  // Only the frontal photo goes to the image service.
  expect(log.preview[0]!.postDataBuffer()!.toString('latin1')).not.toContain('name="profile"');

  // The consent covers the session: the next preview starts straight away.
  const second = cards(page).nth(1);
  await second.getByRole('button', { name: 'Ver cómo te queda' }).click();
  await expect(second.getByRole('img', { name: /Simulación generada por IA/ })).toBeVisible();
  await expect(dialog).toBeHidden();

  // On the detail sheet, before and after side by side, and it can be deleted.
  await first.getByRole('link', { name: 'Ver ficha' }).click();
  await expect(page.getByRole('img', { name: 'Tu foto frontal, sin cambios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar imagen' })).toBeVisible();
  await page.getByRole('button', { name: 'Borrar simulación' }).click();
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
  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tu foto' });
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

test('replacing the frontal photo discards previews made from the old one', async ({ page }) => {
  await mockApi(page);
  await reachLiveResults(page);
  const first = cards(page).first();
  await first.getByRole('button', { name: 'Ver cómo te queda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver el corte sobre tu foto' });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Aceptar y generar' }).click();
  await expect(first.getByRole('img', { name: /Simulación generada por IA/ })).toBeVisible();

  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Fotos' }).click();
  await page.getByTestId('input-frontal').setInputFiles(`${FIXTURES}/frontal.webp`);
  await expect(page.getByTestId('slot-frontal').getByText('Lista')).toBeVisible();
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Resultados' }).click();
  await expect(page.getByRole('img', { name: /Simulación generada por IA/ })).toHaveCount(0);
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
