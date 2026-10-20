import { expect, test } from '@playwright/test';
import { answerAll, answerRequired, mockApi, startDemo, startLive } from './support.ts';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('7 · completes the whole questionnaire and shows every answer for review', async ({ page }) => {
  await startLive(page);
  await expect(page.getByText('Pregunta 1 de 9')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progreso del cuestionario' })).toHaveAttribute('aria-valuenow', '1');
  await answerAll(page);

  const review = page.locator('.review-list');
  for (const text of [
    'Todas las categorías',
    'Ondulado',
    'Grueso o muy denso · Remolinos · «Tengo un remolino en la coronilla.»',
    'Medio',
    'Menos de 5 minutos al día',
    'Natural, Moderno · «Algo cuidado pero sin esfuerzo.»',
    'Secador, Cremas para rizos · Prefiero mantenerla sencilla',
    'Probar un flequillo · «Nada de rapados al cero.»',
    '«Trabajo de cara al público.»',
  ]) {
    await expect(review.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Analizar mis fotos' })).toBeEnabled();
  // The draft ticket filled in along the way, too.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisa antes de analizar');
});

test('8 · optional questions can be skipped and required ones cannot', async ({ page }) => {
  await startLive(page);
  // Required: no "Omitir" and "Siguiente" stays disabled until answered.
  await expect(page.getByRole('link', { name: 'Omitir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await expect(page.getByText('Elige una opción para seguir.')).toBeVisible();
  await answerRequired(page);

  const review = page.locator('.review-list');
  await expect(review.getByText('Sin respuesta')).toHaveCount(4);
  await expect(review.getByText('Falta responder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analizar mis fotos' })).toBeEnabled();
});

test('going back keeps every answer, and editing from the review returns there', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('radio', { name: /^Femeninos/ }).check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('radio', { name: /^Rizado/ }).check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('link', { name: 'Atrás' }).click();
  await expect(page.getByRole('radio', { name: /^Rizado/ })).toBeChecked();
  await page.getByRole('link', { name: 'Atrás' }).click();
  await expect(page.getByRole('radio', { name: /^Femeninos/ })).toBeChecked();
  // The browser's back button works the same way.
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.goBack();
  await expect(page.getByRole('radio', { name: /^Rizado/ })).toBeChecked();

  // Answers live only in memory: a full reload starts a new session.
  await page.reload();
  await expect(page).toHaveURL(/estudio\/fotos$/);
});

test('the review names what is missing and links to each question', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('radio', { name: /^Andróginos/ }).check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  // Jump to the review through the step list with answers missing.
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Revisión' }).click();
  await expect(page.getByText('Falta responder: textura, densidad, longitud actual, tiempo al día.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver la demostración' })).toBeDisabled();
  await page.getByRole('link', { name: 'Cambiar: Textura' }).click();
  await expect(page).toHaveURL(/cuestionario\/textura$/);
});

test('19 · the questionnaire works with the keyboard alone', async ({ page }) => {
  await startDemo(page);
  const focused = () =>
    page.evaluate(() => document.activeElement?.tagName.toLowerCase() + ':' + (document.activeElement?.textContent ?? '').trim().slice(0, 40));

  // Focus moves to the question title on each screen.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: /^Masculinos/ })).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Femeninos/ })).toBeChecked();
  await page.keyboard.press('Enter'); // submits the form: next question
  await expect(page).toHaveURL(/cuestionario\/textura$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  const title = page.getByRole('heading', { level: 1 });
  for (const slug of ['densidad', 'longitud', 'tiempo']) {
    await expect(title).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`cuestionario/${slug}$`));
  }
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/cuestionario\/estetica$/);

  // Checkboxes toggle with Space; Enter moves on.
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Clásico' })).toBeChecked();
  for (const slug of ['herramientas', 'objetivos', 'comentario']) {
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`cuestionario/${slug}$`));
    await expect(title).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await page.keyboard.type('Escrito con el teclado.');
  await page.keyboard.press('Shift+Tab');
  // Tab through to "Revisar respuestas" and press it.
  for (let i = 0; i < 10 && !(await focused()).includes('Revisar respuestas'); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/revision$/);
  await expect(page.getByText('«Escrito con el teclado.»')).toBeVisible();
});

test('the skip link jumps to the content', async ({ page }) => {
  await page.goto('estudio/fotos');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
