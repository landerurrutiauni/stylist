import { expect, test, type Page } from '@playwright/test';
import { cards, formField, mockApi, reachLiveResults, resultEvents, type ApiLog } from './support.ts';

const styles = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-style')));
const card = (page: Page, styleId: string) => page.locator(`[data-testid="recommendation"][data-style="${styleId}"]`);

let log: ApiLog;

test.beforeEach(async ({ page }) => {
  log = await mockApi(page, { analyze: [{ events: resultEvents() }] });
  await reachLiveResults(page);
});

test('13 · switches between short, medium and long, by mouse and keyboard', async ({ page }) => {
  const tabs = page.getByRole('tablist', { name: 'Longitud' });
  await expect(tabs.getByRole('tab')).toHaveText(['Corto 2', 'Medio 2', 'Largo 2']);
  expect(await styles(page)).toEqual(['textured-crop', 'side-part']);
  await expect(page.getByText('2 cortes de longitud corto')).toBeVisible();

  await tabs.getByRole('tab', { name: /Medio/ }).click();
  await expect(page).toHaveURL(/longitud=medio/);
  await expect(tabs.getByRole('tab', { name: /Medio/ })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => styles(page)).toEqual(['curtain-shag', 'lob']);

  await tabs.getByRole('tab', { name: /Medio/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /Largo/ })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: /Largo/ })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => styles(page)).toEqual(['long-curtain-bangs', 'long-layers']);
  await expect(page.getByText(/Solo dos opciones largas porque tardarían/)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(tabs.getByRole('tab', { name: /Corto/ })).toHaveAttribute('aria-selected', 'true');
});

test('the estimated score is explained factor by factor', async ({ page }) => {
  const crop = card(page, 'textured-crop');
  await expect(crop.getByLabel('Compatibilidad estimada 75 sobre 100')).toBeVisible();
  await expect(crop.getByText('Compatibilidad alta')).toBeVisible();
  await expect(card(page, 'side-part').getByText('Opción exploratoria')).toBeVisible();
  await crop.getByText('Por qué esta puntuación').click();
  const table = crop.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(table.getByText('Rasgos observables')).toBeVisible();
  await expect(table.getByText('El volumen arriba equilibra la mandíbula marcada.')).toBeVisible();
});

test('14 · filters by time, aesthetic, difficulty and saved cuts', async ({ page }) => {
  const filters = page.getByRole('group', { name: 'Filtros' });
  await filters.getByLabel('Tiempo al día').selectOption('5');
  await expect(page).toHaveURL(/tiempo=5/);
  await expect(page.getByText('1 de 2 cortes cortos con estos filtros')).toBeVisible();
  await expect.poll(() => styles(page)).toEqual(['textured-crop']);
  await page.getByRole('button', { name: 'Quitar filtros' }).first().click();
  await expect.poll(() => styles(page)).toEqual(['textured-crop', 'side-part']);

  await filters.getByLabel('Estética').selectOption({ label: 'Clásico' });
  await expect.poll(() => styles(page)).toEqual(['side-part']);
  await filters.getByLabel('Estética').selectOption('any');

  await page.getByRole('tab', { name: /Medio/ }).click();
  await filters.getByLabel('Dificultad').selectOption('medium');
  await expect.poll(() => styles(page)).toEqual(['curtain-shag']);
  await filters.getByLabel('Dificultad').selectOption('any');

  // Saved cuts.
  const save = card(page, 'lob').getByRole('button', { name: 'Guardar' });
  await save.click();
  await expect(card(page, 'lob').getByRole('button', { name: 'Guardado' })).toHaveAttribute('aria-pressed', 'true');
  // The filter lives in the URL, so it settles a moment after the click.
  await filters.getByRole('checkbox', { name: 'Solo guardados' }).click();
  await expect(filters.getByRole('checkbox', { name: 'Solo guardados' })).toBeChecked();
  await expect.poll(() => styles(page)).toEqual(['lob']);

  // A combination that leaves nothing says so and offers a way out.
  await page.getByRole('tab', { name: /Largo/ }).click();
  await expect(page.getByText('Ningún corte cumple estos filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtros' }).last().click();
  await expect.poll(() => styles(page)).toEqual(['long-curtain-bangs', 'long-layers']);
});

test('15 · compares two cuts side by side', async ({ page }) => {
  await card(page, 'textured-crop').getByRole('checkbox', { name: 'Comparar' }).check();
  await expect(page.getByText('Elige otro corte para comparar.')).toBeVisible();
  await page.getByRole('tab', { name: /Medio/ }).click();
  await card(page, 'curtain-shag').getByRole('checkbox', { name: 'Comparar' }).check();
  const bar = page.getByRole('region', { name: 'Comparación' });
  await expect(bar).toContainText('Comparar Crop texturizado con flequillo corto y Shag con flequillo cortina');
  await bar.getByRole('button', { name: 'Comparar', exact: true }).click();

  await expect(page).toHaveURL(/comparar\?a=textured-crop&b=curtain-shag/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comparar dos cortes');
  const diff = page.getByRole('region', { name: 'Diferencias clave' });
  await expect(diff).toContainText('minutos más al día');
  await expect(diff).toContainText('Dificultad de peinado: fácil en Crop texturizado con flequillo corto, media en Shag con flequillo cortina.');
  await expect(page.getByRole('table', { name: /Comparación de Crop texturizado/ })).toBeVisible();

  await page.getByLabel('Segundo corte').selectOption('lob');
  await expect(page).toHaveURL(/b=lob/);
  await expect(page.getByRole('table', { name: 'Comparación de Crop texturizado con flequillo corto y Lob recto a la clavícula' })).toBeVisible();
});

test('16 · changing answers and asking for adjustments re-runs the analysis without new photos', async ({ page }) => {
  await page.getByRole('link', { name: 'Cambiar respuestas' }).click();
  await expect(page).toHaveURL(/revision$/);
  await page.getByRole('link', { name: 'Cambiar: Tiempo al día' }).click();
  await page.getByRole('radio', { name: /^Más de 20 minutos/ }).check();
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Revisión' }).click();
  await expect(page).toHaveURL(/revision$/);
  await expect(page.locator('.review-list').getByText('Más de 20 minutos si el resultado merece la pena')).toBeVisible();
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu ficha de estilo');
  expect(log.analyze).toHaveLength(2);
  expect(JSON.parse(formField(log.analyze[1]!, 'answers')!).maintenance).toBe('over20');

  await page.getByLabel('¿Qué cambiarías?').fill('Más opciones con flequillo');
  await page.getByRole('button', { name: 'Generar de nuevo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu ficha de estilo');
  expect(log.analyze).toHaveLength(3);
  const third = log.analyze[2]!;
  expect(formField(third, 'refinement')).toBe('Más opciones con flequillo');
  expect(third.postDataBuffer()!.toString('latin1')).toContain('name="frontal"; filename="frontal.jpg"');
});

test('the detail sheet has the salon brief, ready to copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await card(page, 'textured-crop').getByRole('link', { name: 'Ver ficha' }).click();
  await expect(page).toHaveURL(/resultados\/textured-crop$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crop texturizado con flequillo corto');
  const ticket = page.getByRole('region', { name: 'Qué pedir en la peluquería' });
  await expect(ticket).toContainText('Laterales a tijera de 3 cm');
  await ticket.getByRole('button', { name: 'Copiar indicaciones' }).click();
  await expect(ticket.getByText('Copiado. Pégalo en un mensaje para tu peluquería.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Laterales a tijera de 3 cm');
  await page.getByRole('link', { name: 'Volver a las recomendaciones' }).click();
  await expect(page).toHaveURL(/resultados$/);
});
