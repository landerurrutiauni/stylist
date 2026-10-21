# Privacidad y tratamiento de datos

Este documento describe qué datos maneja FOLIA, por dónde pasan y qué se puede garantizar y qué no. Está pensado para quien publique o
revise la aplicación. La versión para usuarios está en la propia web (`/privacidad`).

## Qué datos hay

| Dato                                 | Dónde está                                                | Cuánto tiempo                                       |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------- |
| Fotos (frente y perfil)              | memoria de la pestaña, como `Blob`                        | hasta «Borrar sesión», recargar o cerrar la pestaña |
| Respuestas al cuestionario y ajustes | memoria de la pestaña                                     | igual                                               |
| Resultados y simulaciones            | memoria de la pestaña                                     | igual                                               |
| Fotos y respuestas en el servidor    | memoria del proceso, durante la petición                  | lo que dura la petición                             |
| Contadores de uso                    | tabla `folia_rate_limits` (hash SHA-256 con sal de la IP) | se borran a los dos días                            |

FOLIA no escribe nada en `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies (lo comprueba una prueba E2E). Las URL
`blob:` de las fotos se revocan al sustituirlas, al borrar la sesión y al cerrar la pestaña (`pagehide`).

## Antes de salir del navegador

- La imagen se identifica por sus bytes (no por la extensión) y se rechaza si no es JPEG, PNG o WebP, si es HEIC, si pesa más de 15 MB o
  si es demasiado pequeña.
- Se decodifica aplicando la orientación EXIF y se vuelve a codificar en JPEG a 1600 px como máximo mediante un `canvas`: el archivo
  resultante no lleva metadatos (ubicación GPS, fecha, modelo de cámara). Una prueba E2E verifica que lo enviado no contiene EXIF.
- Nada se envía hasta que la persona acepta un consentimiento que nombra al proveedor (Anthropic) y explica qué se envía y para qué.

## Proveedores

### Anthropic (análisis)

Recibe las dos fotos y las respuestas. Según el
[centro de privacidad de Anthropic](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
(consultado en octubre de 2026), las entradas y salidas de su API se borran automáticamente en un plazo de 30 días, salvo que se haya
acordado otra cosa (por ejemplo, retención cero), que haga falta conservarlas para aplicar su política de uso (hasta dos años si una
petición se marca como contraria a ella) o que lo exija la ley. Según
[la misma fuente](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), las entradas y salidas de sus
productos comerciales, incluida la API, no se usan para entrenar modelos por defecto.

### Google (simulación, opcional)

Solo si la persona pide ver un corte sobre su foto y acepta un segundo consentimiento que nombra a Google, se envían la foto frontal y la
descripción del corte a la API de Gemini, con `store: false`. Según la
[página de supervisión de abusos](https://ai.google.dev/gemini-api/docs/usage-policies), Google conserva las peticiones y respuestas 55 días
para detectar infracciones de su política de uso. Según los [términos de la API](https://ai.google.dev/gemini-api/terms), en los servicios
de pago Google no usa las peticiones ni las respuestas para mejorar sus productos; **en el nivel gratuito sí puede hacerlo**, así que la
clave de Gemini debe pertenecer a un proyecto con facturación activada. Las imágenes generadas llevan la marca de agua SynthID.

### Supabase (alojamiento de la API)

La función no guarda fotos ni respuestas y sus registros solo contienen eventos técnicos. La plataforma registra por su cuenta metadatos
de cada petición (hora, ruta, estado, duración), como cualquier servicio web. El proyecto está en la región `eu-west-3` (París).

## Lo que FOLIA no hace

- No identifica a personas ni compara caras.
- No infiere género, edad, origen étnico, salud ni personalidad; la persona elige qué estilos explorar.
- No puntúa el atractivo: la compatibilidad estimada mide el encaje de un corte con lo observado y lo declarado.
- No usa las fotos para nada distinto del análisis y las simulaciones pedidas.

## Para quien publique FOLIA

El consentimiento de la web informa, pero no convierte la publicación en conforme al RGPD por sí solo. Las fotos de la cara son datos
personales; quien publique FOLIA es responsable del tratamiento y debe, entre otras cosas: identificarse como responsable en la página de
privacidad, establecer la base jurídica (consentimiento), firmar los acuerdos de encargo de tratamiento con los proveedores (Anthropic,
Google, Supabase), revisar las transferencias internacionales de datos y valorar si hace falta una evaluación de impacto. Si es posible,
conviene solicitar retención cero a Anthropic.
