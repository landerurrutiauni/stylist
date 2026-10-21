# API de FOLIA

La API es una sola función `(Request) => Promise<Response>` en [`server/core/handler.ts`](../server/core/handler.ts). Corre igual en Node
(desarrollo, `npm run dev:api`), en Supabase Edge Functions (producción, Deno) y en las pruebas.

Base en producción: `https://klyhstkwquvphncvdguv.supabase.co/functions/v1/folia-analyze`

## Endpoints

### `GET /health`

Dice si el análisis y la simulación están disponibles, sin revelar nada secreto.

```json
{
  "ok": true,
  "analysis": "available | missing_api_key",
  "model": "claude-opus-5-5",
  "preview": "available | missing_api_key",
  "previewModel": "gemini-nano-banana-2.1",
  "limits": { "maxImageBytes": 4194304, "perHour": 6, "previewsPerHour": 10 }
}
```

### `POST /analyze`

`multipart/form-data` con:

| Campo                | Contenido                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `frontal`, `profile` | JPEG, PNG o WebP; máximo 4 MB, lado corto ≥ 480 px, lado largo ≤ 8000 px. Se comprueban por sus bytes, no por el nombre. |
| `answers`            | JSON validado con `answersSchema` ([`shared/schema/answers.ts`](../shared/schema/answers.ts))                            |
| `refinement`         | texto opcional (≤ 400 caracteres) para regenerar                                                                         |
| `consent`            | debe valer `accepted`                                                                                                    |

La respuesta es `application/x-ndjson`: un evento JSON por línea, para mostrar progreso real.

```
{"type":"stage","stage":"received"}
{"type":"stage","stage":"observing"}       ← el modelo ha empezado
{"type":"stage","stage":"writing"}
{"type":"progress","recommendations":3}    ← recomendaciones ya escritas
{"type":"ping"}                            ← cada 10 s, mantiene viva la conexión
{"type":"stage","stage":"validating"}
{"type":"result","analysis":{ "id", "createdAt", "mode":"live", "model", "output" }}
```

o, si algo falla durante el análisis, `{"type":"error","code","message","retryable"}` como última línea. `output` sigue
`analysisOutputSchema` ([`shared/schema/analysis.ts`](../shared/schema/analysis.ts)).

### `POST /preview`

`multipart/form-data` con `frontal`, `styleId` (del catálogo), `variantName`, `instructions`, `texture` y `consent=accepted`. Devuelve
`{"type":"preview","styleId","mime","data"(base64),"model"}`. Solo se envía la foto frontal.

## Errores

Cuerpo común: `{"type":"error","code","message","retryable","field?"}`. `message` está en español y nunca incluye detalles del proveedor.

| Código                                                                               | HTTP                | Cuándo                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------- |
| `invalid_request`                                                                    | 400 / 404 / 405     | formulario, respuestas o ruta no válidos                                                |
| `consent_required`                                                                   | 400                 | falta `consent=accepted`                                                                |
| `invalid_image`                                                                      | 422                 | falta una foto, está vacía o es demasiado pequeña (`field` dice cuál)                   |
| `unsupported_type`                                                                   | 415                 | no es JPEG, PNG ni WebP                                                                 |
| `image_too_large`, `payload_too_large`                                               | 413                 | foto > 4 MB o petición > 9 MB                                                           |
| `origin_not_allowed`                                                                 | 403                 | origen fuera de `ALLOWED_ORIGINS` o sin cabecera `Origin`                               |
| `rate_limited`, `daily_limit`                                                        | 429 + `Retry-After` | límite por IP y hora, o límite global diario                                            |
| `missing_api_key`, `preview_unavailable`                                             | 503                 | el servidor no tiene la clave correspondiente                                           |
| `provider_auth`, `provider_rate_limited`, `provider_unavailable`, `provider_timeout` | evento o 4xx/5xx    | fallos del proveedor                                                                    |
| `refused`, `truncated`, `invalid_model_response`                                     | evento              | el modelo rechazó, se quedó corto o devolvió algo que no pasa el esquema o la auditoría |

## Llamada a Anthropic

[`server/core/model.ts`](../server/core/model.ts) usa el SDK oficial `@anthropic-ai/sdk` con:

- `model`: `ANTHROPIC_MODEL` (por defecto `claude-opus-5-5`), `thinking: {type: "adaptive"}`, `output_config.effort` (`ANTHROPIC_EFFORT`,
  por defecto `medium`) y `output_config.format` con el esquema JSON generado desde Zod (manteniendo los `enum`, como el catálogo).
- Las dos fotos como bloques `image` en base64, precedidas de su etiqueta, y las respuestas como texto.
- El prompt de sistema ([`server/core/prompt.ts`](../server/core/prompt.ts)) con caché efímera.
- Streaming, para informar del progreso y no topar con límites de tiempo.
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si el modelo principal rechaza, otro modelo continúa; el texto anterior al
  bloque `fallback` se descarta. `ANTHROPIC_FALLBACKS=off` lo desactiva.

La prueba [`tests/unit/model.test.ts`](../tests/unit/model.test.ts) comprueba la forma exacta de esa petición con un `fetch` simulado.

## Seguridad

- **CORS** con lista blanca (`ALLOWED_ORIGINS`), `Vary: Origin`, y rechazo con 403 de cualquier otro origen. Las peticiones de análisis sin
  `Origin` se rechazan salvo `REQUIRE_ORIGIN=false`.
- **Límites:** 9 MB por petición (se mira `Content-Length` antes de leer), 4 MB por foto, validación de bytes y dimensiones.
- **Rate limiting:** por hash SHA-256 con sal de la IP (`RATE_LIMIT_SALT`), por hora y global por día, por separado para análisis y
  simulaciones. En Supabase los contadores se guardan en la tabla `folia_rate_limits` mediante la función `folia_rate_limit_hit` (solo
  `service_role`, RLS activado sin políticas). Si la tabla no existe o la base de datos no responde, cuenta en memoria de cada instancia.
- **Registros:** solo eventos técnicos (`analysis_ok`, duración, número de recomendaciones, códigos de error). Nunca fotos, respuestas,
  texto del modelo ni IP.
- **Cabeceras:** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- `verify_jwt` desactivado a propósito: la web no tiene sesiones de Supabase; la función hace su propia comprobación de origen y límites.

## Despliegue en Supabase

1. Crea el proyecto y aplica la migración:
   `npx supabase db push --project-ref <ref>` o pega
   [`supabase/migrations/20261020000000_folia_rate_limit.sql`](../supabase/migrations/20261020000000_folia_rate_limit.sql) en el SQL Editor.
2. Compila y despliega la función:
   ```bash
   npm run build:edge
   npx supabase functions deploy folia-analyze --project-ref <ref> --no-verify-jwt --use-api
   ```
   `build:edge` empaqueta `server/` en `supabase/functions/folia-analyze/index.js` y deja `zod` y `@anthropic-ai/sdk` como importaciones
   `npm:` con las versiones de `package-lock.json`.
3. Define los secretos (Dashboard › Edge Functions › Secrets, o `npx supabase secrets set`):
   `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (opcional), `ALLOWED_ORIGINS` y `RATE_LIMIT_SALT` y, si quieres,
   `ANTHROPIC_MODEL`, `RATE_LIMIT_PER_HOUR`, `DAILY_ANALYSIS_LIMIT`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone la plataforma.
4. Comprueba: `curl https://<ref>.supabase.co/functions/v1/folia-analyze/health -H "Origin: https://landerurrutiauni.github.io"`.

En Supabase, si no defines `ALLOWED_ORIGINS`, la función admite solo `https://landerurrutiauni.github.io`, y si no defines
`RATE_LIMIT_SALT`, usa como sal la clave secreta de servicio del propio proyecto (nunca sale de la función). En cualquier otra plataforma,
sin `ALLOWED_ORIGINS` la API rechaza las llamadas del navegador con `origin_not_allowed`.

## Despliegue actual

El proyecto de Supabase `folia` (`klyhstkwquvphncvdguv`, región `eu-west-3`) tiene la función `folia-analyze` (versión 1, `verify_jwt`
desactivado). Se desplegó con la herramienta de Supabase de esta sesión a partir de un punto de entrada que importa `server/supabase/index.ts`
de este repositorio fijado al commit `3b2d5f9` (`https://raw.githubusercontent.com/landerurrutiauni/stylist/3b2d5f93…/server/supabase/index.ts`)
y un `deno.json` que mapea `zod` y `@anthropic-ai/sdk` a `npm:`. Supabase empaqueta el código en el momento del despliegue, así que la
función no depende de GitHub mientras se ejecuta. Para actualizarla, usa el paso 2 de arriba.

Pendiente en ese proyecto: los secretos `ANTHROPIC_API_KEY` (y `GEMINI_API_KEY` si quieres simulaciones) y la migración del límite de uso.

## Desarrollo local

`npm run dev:api` lee `.env`, permite por defecto `http://localhost:5173` y `http://localhost:4173` y escucha en `http://localhost:8787`.
Los límites se cuentan en memoria.
