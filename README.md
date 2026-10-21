# FOLIA · Tu estilista personal

FOLIA estudia una foto de frente y otra de perfil junto a un cuestionario corto y propone cortes de pelo cortos, medios y largos, cada uno con su
explicación, una compatibilidad estimada razonada, el tiempo de peinado, los productos y las indicaciones para llevar a la peluquería. Si el
servidor lo tiene activado, también genera una simulación de cada corte sobre tu propia foto.

- **Web:** <https://landerurrutiauni.github.io/stylist/> (GitHub Pages)
- **API:** `https://klyhstkwquvphncvdguv.supabase.co/functions/v1/folia-analyze` (Supabase Edge Function)
- **Diseño:** [DESIGN.md](DESIGN.md) · **API:** [docs/BACKEND.md](docs/BACKEND.md) · **Privacidad:** [docs/PRIVACY.md](docs/PRIVACY.md)

### Estado del despliegue (21 de octubre de 2026)

| Pieza                                        | Estado                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Compilación y pruebas en GitHub Actions      | ✅ lint, tipos, formato, 95 pruebas unitarias y 48 E2E en verde                                              |
| Web en GitHub Pages                          | ⏳ compilada y lista; falta activar **Settings › Pages › Source: GitHub Actions** y volver a lanzar el flujo |
| API en Supabase (`folia-analyze`, versión 1) | ✅ desplegada y respondiendo en `/health`                                                                    |
| Análisis real con Claude                     | ⏳ falta el secreto `ANTHROPIC_API_KEY` en Supabase (hasta entonces, modo demostración)                      |
| Simulación con Gemini                        | ⏳ falta el secreto `GEMINI_API_KEY` (opcional)                                                              |
| Límite de uso compartido                     | ⏳ falta aplicar la migración `supabase/migrations/…_folia_rate_limit.sql`; mientras, cuenta en memoria      |

## Cómo funciona

```
Navegador (GitHub Pages, estático)                 Supabase Edge Function (Deno)              Proveedores
─────────────────────────────────                  ─────────────────────────────              ───────────
fotos → validación, EXIF fuera, 1600 px     ──►     /analyze  CORS, límites, validación  ──►   Anthropic (Claude, visión)
cuestionario (Zod)                          ◄──     NDJSON: etapas, progreso, resultado        respuesta JSON con esquema
resultados, filtros, comparación                    Zod + auditoría + puntuación
simulación (opcional, 2.º consentimiento)   ──►     /preview  ──────────────────────────►      Google (Gemini, edición de imagen)
```

- **El navegador no conoce ninguna clave.** Solo sabe la URL pública de la API (`VITE_API_BASE_URL`). Las claves de Anthropic y Google viven
  como secretos del servidor.
- **Nada se guarda.** Fotos, respuestas y resultados están en la memoria de la pestaña (ni `localStorage`, ni `sessionStorage`, ni
  IndexedDB, ni cookies). El servidor procesa cada petición en memoria y sus registros solo llevan datos técnicos.
- **Resultado estructurado y validado.** Claude responde con un esquema JSON (`output_config.format`); el servidor lo valida con Zod y una
  auditoría propia (cortes del catálogo, sin duplicados, explicaciones con contenido…). Lo que no cumple no se muestra.
- **La compatibilidad no la escribe el modelo.** Claude valora cinco factores de 0 a 4 con un motivo cada uno; FOLIA calcula la cifra (0–100,
  en pasos de 5) con pesos fijos y la explica factor por factor. No es una puntuación de belleza.
- **Modo demostración honesto.** Sin servidor o sin clave, FOLIA lo dice y ofrece recomendaciones solo a partir de las respuestas, sin
  simular un análisis de las fotos.

## Requisitos

- Node.js 22 o posterior y npm.
- Para el análisis real: una clave de la API de Anthropic. Para la simulación: una clave de la API de Gemini (proyecto de pago; ver
  [docs/PRIVACY.md](docs/PRIVACY.md)).

## Ejecución local

```bash
npm install
cp .env.example .env        # y rellena ANTHROPIC_API_KEY (y GEMINI_API_KEY si quieres simulaciones)
npm run dev:api             # API en http://localhost:8787
npm run dev                 # web en http://localhost:5173
```

Sin clave, la API responde `missing_api_key` en `/health` y la web ofrece el modo demostración. Sin `VITE_API_BASE_URL`, la web funciona solo en
modo demostración. «Ver un ejemplo», en la portada, enseña unos resultados de muestra sin fotos.

## Pruebas

```bash
npm run lint && npm run typecheck && npm run format:check
npm test                    # Vitest: 95 pruebas (API, petición a Anthropic con fetch simulado, esquemas, puntuación, demo, calidad de foto)
npm run fixtures            # genera fotos sintéticas (dibujos, no personas) para las pruebas
npm run test:e2e            # Playwright: compila como GitHub Pages bajo /stylist/ y prueba con la API simulada
```

Las pruebas E2E cubren los 23 escenarios del encargo (fotos válidas, falta una foto, formato no válido, demasiado grande, borrar y
sustituir, cuestionario completo y con preguntas omitidas, análisis válido, respuesta inválida del modelo, falta la clave, servidor caído,
sin conexión, cambio de longitud, filtros, comparación, cambiar preferencias, borrar sesión, móvil a 390 px, teclado, recursos estáticos,
subruta de GitHub Pages, rutas internas y ausencia de secretos), además de la simulación con IA y una auditoría de accesibilidad con axe
(WCAG 2.2 AA) en todas las pantallas. Ninguna prueba llama a Anthropic ni a Google.

## Publicación

### Web en GitHub Pages

El flujo [`.github/workflows/pages.yml`](.github/workflows/pages.yml) prueba cada push y, en la rama por defecto, compila con
`BASE_PATH=/stylist/`, comprueba que no hay secretos en `dist/` y publica con GitHub Pages.

1. En **Settings › Pages › Build and deployment › Source**, elige **GitHub Actions** (el flujo intenta activarlo, pero el token por
   defecto no siempre tiene permiso).
2. Si la API cambia de dirección, crea la variable de repositorio `VITE_API_BASE_URL` (Settings › Secrets and variables › Actions ›
   Variables). No es secreta: acaba en el JavaScript publicado.

La compilación genera `404.html` (copia de `index.html`) para que las rutas internas funcionen al recargar, `.nojekyll` y una
Content-Security-Policy que solo permite conectar con el propio sitio y con la API.

### API en Supabase Edge Functions

Detalle completo en [docs/BACKEND.md](docs/BACKEND.md). En resumen:

```bash
npm run build:edge          # supabase/functions/folia-analyze/index.js, con zod y el SDK de Anthropic como npm:
npx supabase functions deploy folia-analyze --project-ref <ref> --no-verify-jwt --use-api
npx supabase secrets set --project-ref <ref> ANTHROPIC_API_KEY=… GEMINI_API_KEY=… RATE_LIMIT_SALT=… \
  ALLOWED_ORIGINS=https://landerurrutiauni.github.io
```

Aplica también la migración `supabase/migrations/20261020000000_folia_rate_limit.sql` para que el límite de uso se comparta entre
instancias. Si añades el secreto `SUPABASE_ACCESS_TOKEN` y la variable `SUPABASE_PROJECT_REF` al repositorio, el flujo de GitHub Actions
despliega la función en cada push a la rama por defecto.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las importantes:

| Variable                                      | Dónde                           | Para qué                                                |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `VITE_API_BASE_URL`                           | compilación de la web (pública) | URL de la API                                           |
| `ANTHROPIC_API_KEY`                           | servidor (secreta)              | análisis con Claude                                     |
| `ANTHROPIC_MODEL`                             | servidor                        | modelo, por defecto `claude-opus-5-5`                   |
| `GEMINI_API_KEY`                              | servidor (secreta)              | simulación del corte sobre la foto                      |
| `ALLOWED_ORIGINS`                             | servidor                        | orígenes permitidos por CORS (lista separada por comas) |
| `RATE_LIMIT_PER_HOUR`, `DAILY_ANALYSIS_LIMIT` | servidor                        | límites de uso                                          |
| `RATE_LIMIT_SALT`                             | servidor (secreta)              | sal para el hash de las IP                              |

## Estructura

```
src/            web (React 19 + Vite + TypeScript): portada, estudio, resultados, dibujos de cortes
shared/         esquemas Zod, catálogo de 30 cortes, etiquetas, puntuación, lectura de imágenes (web y servidor)
server/core/    API independiente de la plataforma: handler, Anthropic, Gemini, validación, límites
server/node/    servidor local de desarrollo
server/supabase/ punto de entrada de la Edge Function
supabase/       migración y configuración del CLI
tests/          Vitest (unit) y Playwright (e2e)
scripts/        fotos sintéticas, 404.html, simulador de GitHub Pages, escáner de secretos, bundle de la función
```

## Límites conocidos

- La forma de la cara es una estimación con incertidumbre, y la textura y la densidad salen de lo que la persona declara: una foto no
  basta para afirmarlas.
- Las imágenes del sitio son dibujos paramétricos hechos en código; las colecciones abiertas de fotografía no eran accesibles desde el
  entorno de desarrollo.
- La simulación con IA es una aproximación y depende del modelo de imagen de Google.
- El consentimiento informa, pero no sustituye a las obligaciones legales (RGPD) de quien publique FOLIA: ver [docs/PRIVACY.md](docs/PRIVACY.md).

## Créditos

Tipografía Hanken Grotesk (SIL Open Font License), autoalojada. Dirección de arte con las skills Taste-Skill (`design-taste-frontend`),
`frontend-design` y `web-design-guidelines`; pruebas de navegador con Playwright. Análisis con Claude (Anthropic) y simulaciones con Gemini
(Google).
