import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { answerRequired, cards, mockApi, reachLiveResults, startLive, watchErrors } from './support.ts';

const DIST = 'dist-e2e';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test('20 · the static build loads every resource from the published folder', async ({ page }) => {
  await mockApi(page);
  const errors = watchErrors(page);
  const failed: string[] = [];
  const loaded: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname !== 'localhost') return;
    loaded.push(url.pathname);
    if (response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`);
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tu corte');
  await page.evaluate(() => document.fonts.ready);

  expect(failed).toEqual([]);
  expect(loaded.some((pathname) => /\/stylist\/assets\/index-[\w-]+\.js$/.test(pathname))).toBe(true);
  expect(loaded.some((pathname) => /\/stylist\/assets\/index-[\w-]+\.css$/.test(pathname))).toBe(true);
  expect(loaded.some((pathname) => pathname.endsWith('.woff2'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 16px "Hanken Grotesk"'))).toBe(true);
  // The stylesheet is applied: the mustard field from the design tokens.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(225, 172, 16)');
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect((await page.request.get(new URL(favicon!, page.url()).href)).status()).toBe(200);
  expect(errors).toEqual([]);

  // The build ships 404.html (deep links) and .nojekyll (no Jekyll processing).
  expect(readFileSync(`${DIST}/404.html`, 'utf8')).toBe(readFileSync(`${DIST}/index.html`, 'utf8'));
  expect(statSync(`${DIST}/.nojekyll`).isFile()).toBe(true);
});

test('21 · everything is addressed under the GitHub Pages sub-path', async ({ page, request }) => {
  await mockApi(page);
  const html = readFileSync(`${DIST}/index.html`, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
  expect(refs.length).toBeGreaterThan(2);
  for (const ref of refs) expect(ref.startsWith('/stylist/'), ref).toBe(true);

  await page.goto('./');
  const links = await page.locator('a[href^="/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')!));
  expect(links.length).toBeGreaterThan(3);
  for (const href of links) expect(href.startsWith('/stylist'), href).toBe(true);
  await page.getByRole('link', { name: 'Empezar con mis fotos' }).first().click();
  await expect(page).toHaveURL('http://localhost:4321/stylist/estudio/fotos');

  // Outside the sub-path nothing exists, as on github.io.
  const asset = refs.find((ref) => ref.endsWith('.js'))!;
  expect((await request.get(`http://localhost:4321${asset}`)).status()).toBe(200);
  expect((await request.get(`http://localhost:4321${asset.replace('/stylist', '')}`)).status()).toBe(404);
});

test('22 · internal routes work as deep links, on reload and with history', async ({ page, request }) => {
  await mockApi(page);
  // GitHub Pages answers unknown paths with 404.html and status 404; the app still starts.
  const deep = await request.get('estudio/resultados');
  expect(deep.status()).toBe(404);
  expect(await deep.text()).toContain('<div id="root">');

  const routes: [string, string | RegExp][] = [
    ['privacidad', 'Privacidad'],
    ['estudio/fotos', 'Tus dos fotos'],
    ['estudio/resultados', 'No hay resultados en esta sesión'],
    ['estudio/resultados/lob', 'No hay resultados en esta sesión'],
    ['estudio/comparar?a=lob&b=wolf-cut', 'No hay resultados en esta sesión'],
    ['no-existe', 'Esta página no existe'],
    ['estudio/no-existe', 'Esta página no existe'],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 }), route).toHaveText(heading);
  }

  // Screens that need earlier steps send the person back instead of breaking.
  await page.goto('estudio/consentimiento');
  await expect(page).toHaveURL(/estudio\/fotos$/);
  await page.goto('estudio/cuestionario/textura');
  await expect(page).toHaveURL(/estudio\/fotos$/);
  await page.goto('estudio');
  await expect(page).toHaveURL(/estudio\/fotos$/);

  // Back and forward move through the app without reloading it.
  await page.goto('./');
  await page.getByRole('link', { name: 'Privacidad' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacidad');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tu corte');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacidad');

  await page.goto('no-existe');
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('tu corte');
});

test('23 · the published files carry no secrets and the page cannot reach Anthropic directly', async () => {
  const text = files(DIST)
    .filter((file) => !/\.(woff2?|png|jpe?g|webp)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  for (const forbidden of [
    'sk-ant-',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'x-api-key',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
  expect(files(DIST).some((file) => path.basename(file).startsWith('.env'))).toBe(false);
  expect(files(DIST).some((file) => file.endsWith('.map'))).toBe(false);

  // The Content Security Policy only lets the page talk to itself and the FOLIA API.
  const html = readFileSync(`${DIST}/index.html`, 'utf8');
  expect(html).toContain("connect-src 'self' https://api.folia.test;");
  expect(html).toContain("script-src 'self';");

  // The build's own scanner passes here and catches a planted key.
  execFileSync(process.execPath, ['scripts/check-dist-secrets.mjs', DIST]);
  const copy = mkdtempSync(path.join(tmpdir(), 'folia-dist-'));
  try {
    cpSync(DIST, copy, { recursive: true });
    writeFileSync(path.join(copy, 'assets', 'leak.js'), 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";');
    expect(() => execFileSync(process.execPath, ['scripts/check-dist-secrets.mjs', copy], { stdio: 'pipe' })).toThrow();
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

async function axe(page: Page, label: string) {
  // Let colour transitions (a button turning enabled, a reveal) settle first.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
  expect(summary, label).toEqual([]);
}

/** Scrolls the landing page through so every entrance animation has finished. */
async function revealAll(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1500);
}

test('accessibility: no WCAG 2.2 AA violations found by axe on the main screens', async ({ page }) => {
  await mockApi(page);
  await page.goto('./');
  await revealAll(page);
  await axe(page, 'landing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await axe(page, 'landing, reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('privacidad');
  await axe(page, 'privacy');
  await page.goto('no-existe');
  await axe(page, '404');

  await startLive(page);
  await axe(page, 'question');
  await answerRequired(page);
  await axe(page, 'review');
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();
  await expect(cards(page).first()).toBeVisible();
  await axe(page, 'results');
  await cards(page).first().getByText('Por qué esta puntuación').click();
  await axe(page, 'results with breakdown');
  await cards(page).first().getByRole('link', { name: 'Ver ficha' }).click();
  await axe(page, 'detail');
});

test('accessibility: photos, consent and comparison screens', async ({ page }) => {
  await mockApi(page);
  await page.goto('estudio/fotos');
  await axe(page, 'photos empty');
  await reachLiveResults(page);
  await cards(page).nth(0).getByRole('checkbox', { name: 'Comparar' }).check();
  await cards(page).nth(1).getByRole('checkbox', { name: 'Comparar' }).check();
  await page.getByRole('region', { name: 'Comparación' }).getByRole('button', { name: 'Comparar', exact: true }).click();
  await axe(page, 'compare');
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Fotos' }).click();
  await axe(page, 'photos filled');
  await page.getByRole('navigation', { name: 'Pasos del estudio' }).getByRole('link', { name: 'Consentimiento' }).click();
  await axe(page, 'consent');
});

test('the catalogue separates masculine and feminine cuts at the same length', async ({ page }) => {
  await mockApi(page);
  await page.goto('./');
  const lineup = page.locator('section.lineup');
  await lineup.getByRole('radio', { name: 'Masculinos' }).check({ force: true });
  await expect(lineup.getByText(/cortes: de estilos masculinos/)).toBeVisible();
  const table = lineup.getByRole('table');
  await expect(table.getByRole('rowheader', { name: /Melena recogida en moño/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Butterfly cut/ })).toHaveCount(0);
  await lineup.getByRole('radio', { name: 'Femeninos' }).check({ force: true });
  await expect(table.getByRole('rowheader', { name: /Butterfly cut/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Melena recogida en moño/ })).toHaveCount(0);
  await expect(table.getByRole('rowheader', { name: /Largo con flequillo recto/ })).toContainText('femenino / andrógino');
});
