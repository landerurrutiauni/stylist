import { expect, test, type Page } from '@playwright/test';
import { liveEnvelope, unusableOutput } from '../fixtures/analysis.ts';
import { answerRequired, cards, formField, mockApi, resultEvents, startLive, uploadPhotos, watchErrors } from './support.ts';

async function analyse(page: Page) {
  await startLive(page);
  await answerRequired(page);
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });

test('9 · a valid analysis is shown as a real result, with what was sent', async ({ page }) => {
  const errors = watchErrors(page);
  const log = await mockApi(page);
  await page.goto('estudio/fotos');
  // A photo with EXIF metadata: what leaves the browser must not carry it.
  await uploadPhotos(page, 'tests/fixtures/generated/with-exif.jpg');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Al servidor de FOLIA, que las reenvía a Anthropic')).toBeVisible();
  await expect(page.getByText('(claude-test-model)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar y seguir' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Acepto que FOLIA envíe mis dos fotos/ }).check();
  await page.getByRole('button', { name: 'Aceptar y seguir' }).click();
  await answerRequired(page);
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();

  await expect(title(page)).toHaveText('Tu ficha de estilo');
  await expect(page.getByText(/^Análisis con Claude \(claude-test-model\)/)).toBeVisible();
  await expect(page.getByText('Modo demostración.')).toHaveCount(0);
  await expect(page.getByText('Mandíbula marcada con ángulos visibles.')).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /Corto/ })).toHaveAttribute('aria-selected', 'true');

  // One request, with consent, both photos as re-encoded JPEG and the answers.
  expect(log.analyze).toHaveLength(1);
  const request = log.analyze[0]!;
  expect(formField(request, 'consent')).toBe('accepted');
  const answers = JSON.parse(formField(request, 'answers')!);
  expect(answers).toMatchObject({ expression: 'all', texture: 'wavy', density: 'medium', currentLength: 'medium', maintenance: '5to10' });
  const body = request.postDataBuffer()!.toString('latin1');
  expect(body).toContain('name="frontal"; filename="frontal.jpg"');
  expect(body).toContain('name="profile"; filename="perfil.jpg"');
  expect(body).not.toContain('Exif');
  expect(body).not.toContain('FOLIA test');
  // The browser only ever talks to the FOLIA API: never to Anthropic directly.
  expect(new Set(log.external)).toEqual(new Set(['https://api.folia.test']));
  expect(errors).toEqual([]);
});

test('shows real progress from the stream and can be cancelled', async ({ page }) => {
  await mockApi(page, { analyze: [{ events: resultEvents(), delayMs: 4000 }] });
  await analyse(page);
  await expect(title(page)).toHaveText('Analizando tus fotos');
  await expect(page.getByText(/Enviando: \d+ s/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar análisis' }).click();
  await expect(page).toHaveURL(/revision$/);
});

test('10 · an invalid model response is never shown as a result', async ({ page }) => {
  const broken = liveEnvelope();
  // A result whose structure does not match the schema (unknown cut, no factors).
  const invalid = { ...broken, output: { ...broken.output, recommendations: [{ styleId: 'invented', variantName: 'X' }] } };
  await mockApi(page, {
    analyze: [
      {
        events: [
          { type: 'stage', stage: 'received' },
          { type: 'result', analysis: invalid },
        ],
      },
      {
        events: [
          { type: 'stage', stage: 'validating' },
          { type: 'error', code: 'invalid_model_response', message: 'La respuesta del modelo no cumple la estructura esperada.', retryable: true },
        ],
      },
      { events: ['{"type":"stage"', 'not json at all'] },
    ],
  });
  await analyse(page);
  await expect(title(page)).toHaveText('La respuesta no era válida');
  await expect(page.getByText('Código: invalid_model_response')).toBeVisible();
  await expect(page.getByTestId('recommendation')).toHaveCount(0);

  // The server's own validation failure reads the same way.
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('La respuesta del modelo no cumple la estructura esperada.')).toBeVisible();

  // And so does a stream that cannot be read.
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Código: bad_response')).toBeVisible();
});

test('11 · without an Anthropic key the real analysis is unavailable and the demo is offered', async ({ page }) => {
  const log = await mockApi(page, { health: 'missing_api_key' });
  await page.goto('estudio/fotos');
  await uploadPhotos(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Análisis real no disponible.')).toBeVisible();
  await expect(page.getByText(/no tiene configurada la clave de Anthropic/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Acepto que FOLIA envíe/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Seguir sin enviar fotos (modo demostración)' }).click();
  await answerRequired(page);
  await expect(page.getByText('Modo demostración: no se enviará nada.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver la demostración' }).click();
  await expect(title(page)).toHaveText('Tu ficha de estilo');
  await expect(page.getByText('Modo demostración · no se ha analizado ninguna foto')).toBeVisible();
  await expect(page.getByText(/Tus fotos no se han\s+enviado ni analizado/)).toBeVisible();
  // Nothing was sent.
  expect(log.analyze).toHaveLength(0);
});

test('11b · a 503 missing_api_key from the server reads as unavailable, not as a crash', async ({ page }) => {
  await mockApi(page, {
    analyze: [
      {
        status: 503,
        body: {
          type: 'error',
          code: 'missing_api_key',
          message: 'El análisis real no está disponible: el servidor no tiene configurada la clave de Anthropic.',
          retryable: false,
        },
      },
    ],
  });
  await analyse(page);
  await expect(title(page)).toHaveText('Análisis real no disponible');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver la demostración' }).click();
  await expect(page.getByText('Modo demostración · no se ha analizado ninguna foto')).toBeVisible();
});

test('12 · a backend that is down or failing keeps photos and answers, and retry works', async ({ page }) => {
  await mockApi(page, {
    analyze: [
      { abort: true },
      { status: 500, body: { message: 'boom' } },
      { status: 429, body: { type: 'error', code: 'rate_limited', message: 'Has alcanzado el límite de 6 análisis por hora.', retryable: true } },
      { events: resultEvents() },
    ],
  });
  await analyse(page);
  await expect(title(page)).toHaveText('El servidor no responde');
  await expect(page.getByText(/Tus fotos y respuestas siguen en esta sesión/)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Código: provider_unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(title(page)).toHaveText('Demasiados análisis seguidos');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(title(page)).toHaveText('Tu ficha de estilo');
});

test('12b · when the API cannot be reached at all, the consent screen says so', async ({ page }) => {
  await mockApi(page, { health: 'down' });
  await page.goto('estudio/fotos');
  await uploadPhotos(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/No se ha podido contactar con el servidor de análisis/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar y seguir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seguir sin enviar fotos (modo demostración)' })).toBeVisible();
});

test('12c · offline: the person is told and nothing is lost', async ({ page, context }) => {
  // Routed requests bypass the offline switch, so the mock drops the first one itself.
  await mockApi(page, { analyze: [{ abort: true }, { events: resultEvents() }] });
  await startLive(page);
  await answerRequired(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Analizar mis fotos' }).click();
  await expect(title(page)).toHaveText('Sin conexión');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(title(page)).toHaveText('Tu ficha de estilo');
});

test('a photo rejected by the server sends the person back to replace it', async ({ page }) => {
  await mockApi(page, {
    analyze: [
      {
        status: 422,
        body: { type: 'error', code: 'invalid_image', message: 'La foto de perfil es demasiado pequeña.', retryable: false, field: 'profile' },
      },
    ],
  });
  await analyse(page);
  await expect(title(page)).toHaveText('Hay un problema con una foto');
  await page.getByRole('link', { name: 'Sustituir las fotos' }).click();
  await expect(page).toHaveURL(/estudio\/fotos$/);
  await expect(page.getByTestId('slot-profile').locator('img')).toBeVisible();
});

test('unusable photos produce no recommendations and a clear way forward', async ({ page }) => {
  await mockApi(page, { analyze: [{ events: resultEvents(liveEnvelope(unusableOutput())) }] });
  await analyse(page);
  await expect(page.getByRole('heading', { name: 'Las fotos no permiten un análisis fiable' })).toBeVisible();
  await expect(page.getByText(/La foto frontal está demasiado oscura/)).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sustituir las fotos' })).toBeVisible();
});
