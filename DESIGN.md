# DESIGN.md — FOLIA

El sistema visual de FOLIA tal como está implementado. Todos los valores existen en
`src/styles/tokens.css` y los usan los componentes citados; si el código y este documento no
coinciden, es un error del código.

La estructura sigue el formato DESIGN.md recopilado en
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (tema, color,
tipografía, componentes, maquetación, profundidad, sí y no, responsive, guía para agentes),
ampliado con lo que FOLIA necesita: el sistema de dibujo, el movimiento, la accesibilidad y la voz.

## 1. Tema visual y atmósfera

**La idea.** Un peluquero planifica un corte sobre una _ficha de cabeza_: una cabeza en blanco vista
de frente y de perfil, sobre la que se dibuja el corte con líneas guía. FOLIA pide justo esas dos
vistas, así que la ficha de cabeza es el marco de todas las imágenes del producto:

- las dos fotos de la persona se muestran como las dos vistas de su ficha (resultados, revisión, «Tu ficha»);
- cada corte del catálogo se dibuja como la ficha de ese corte, de frente y de perfil, con la línea de corte en azul;
- la portada abre con un espejo de peluquería (un arco) que contiene una ficha y se abre hasta ocupar toda la pantalla.

Pasa la prueba del competidor: otra app de peinados con IA no podría decir «las dos fotos son las
dos vistas de la ficha con la que trabaja un peluquero».

**Dirección.** Asignada por Taste-Skill (`design-taste-frontend`, ver §14):

- Portada: **The pinned poster** — algo permanece fijo mientras su contenido cambia. Campo mostaza,
  tinta negra y azul real como única interrupción. Esquinas rectas salvo el arco del espejo.
- Estudio (el flujo): estilo de aplicación **Framed sheet** — el marco mostaza contiene la barra; el
  trabajo se apoya en una hoja blanca a 8 px del borde, con esquina de 16 px, filo de 1 px y sin sombra.

**Atmósfera.** Segura y sencilla: un cartel de moda en la portada, una ficha de salón en el estudio.
La tipografía habla; el color llega en campos completos, no como decoración.

## 2. Paleta y funciones del color

| Token             | Hex                                       | Función                                                                          | Contraste                                 |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `--field`         | `#e1ac10`                                 | Mostaza: fondo de la portada y marco del estudio                                 | tinta sobre él 8,6:1                      |
| `--field-step`    | `#cd9d0f`                                 | Un paso de tono sobre mostaza: ventana del héroe, paneles, controles segmentados | —                                         |
| `--ink`           | `#0b0b0b`                                 | Texto, pelo en los dibujos, relleno oscuro                                       | 19,5:1 sobre blanco                       |
| `--ink-muted`     | `#4d3d0a`                                 | Texto secundario sobre mostaza                                                   | 4,6:1 sobre mostaza                       |
| `--accent`        | `#24338f`                                 | Azul real: la acción principal y la línea de corte                               | blanco encima 10,8:1; 4,7:1 sobre mostaza |
| `--accent-strong` | `#1a2670`                                 | Acento al pasar o pulsar                                                         | —                                         |
| `--paper`         | `#ffffff`                                 | Hoja del estudio                                                                 | —                                         |
| `--paper-step`    | `#f3f3f0`                                 | Paneles y opciones sobre la hoja                                                 | —                                         |
| `--paper-active`  | `#e9e9e4`                                 | Opción al pasar, pista vacía del progreso                                        | —                                         |
| `--edge`          | `#e8e8e4`                                 | Filo de la hoja, reglas de tablas y listas (solo estudio)                        | —                                         |
| `--control`       | `#c9c9c2`                                 | Bordes de campos y selectores                                                    | —                                         |
| `--text-muted`    | `#5e5a50`                                 | Texto secundario sobre blanco                                                    | 7:1                                       |
| Pares de estado   | `--positive*`, `--negative*`, `--notice*` | Fondo pálido + tinta oscura del mismo tono                                       | ≥ 4,5:1                                   |

Colores de dibujo: `--draw-head-field #f2c94c` / `--draw-shade-field #c4930b` (cabeza sobre
mostaza), `--draw-head-paper #ebe8e1` / `--draw-shade-paper #d9d5cb` (cabeza sobre blanco),
`--draw-hair #0b0b0b`, `--draw-hair-lit #3b3426` (mechones), `--draw-cut` = acento. Los paneles de
las tarjetas del escaparate usan tonos de pelo de baja saturación (`#c8b98e`, `#cfc6b0`,
`#bfc2b5`, `#c9b07a`, `#bdb6a8`).

**Reglas**

- Proporción en la portada: mostaza 70–85 %, tinta para el texto y los capítulos invertidos, azul
  por debajo del 5 % (botón principal, línea de corte, banda de llamada y los títulos
  «Corto/Medio/Largo» del catálogo).
- Estudio: el color vive en el marco, las fotos, los dibujos y la única acción principal. El resto
  es tinta y grises. El color de estado solo aparece en un estado.
- Los capítulos cambian el campo completo (mostaza → tinta → papel → mostaza oscura → textura de
  pelo → azul → tinta) con cortes limpios. Nada se funde con nada.
- Sin degradados, sin brillos, sin violeta, sin crema con terracota.

## 3. Tipografía

Una sola familia: **Hanken Grotesk**, pesos 400 y 500, alojada en el propio sitio con
`@fontsource/hanken-grotesk` (sin peticiones a un servicio de fuentes, lo que además evita enviar
la IP de cada visitante a un tercero).

| Uso                         | Tamaño                                   | Peso | Espaciado / interlineado |
| --------------------------- | ---------------------------------------- | ---- | ------------------------ |
| Titular del héroe           | `clamp(44px, 4.4vw, 64px)`; móvil 10,5vw | 500  | -0,05em / 0,95           |
| Verbos de capítulo          | `clamp(80px, 11vw, 220px)`; móvil 24vw   | 500  | -0,05em / 0,85           |
| Palabra de la llamada       | `clamp(96px, 26vw, 420px)`               | 500  | -0,06em / 0,75           |
| Nombre del pie              | 30vw (móvil 36vw), recortado             | 500  | -0,06em                  |
| Título de sección (portada) | `--step-head` 32–64 px                   | 500  | -0,04em                  |
| Entradilla                  | `--step-lead` 20–26 px                   | 400  | 1,3–1,35                 |
| Tabla del catálogo          | `clamp(20px, 2.1vw, 30px)`               | 400  | 1,5                      |
| Texto (portada)             | `--step-body` 17–19 px                   | 400  | 1,5                      |
| Título del estudio (h1)     | 28 px                                    | 500  | -0,02em / 1,15           |
| Sección del estudio         | 20 px                                    | 500  | -0,01em                  |
| Texto del estudio           | 16 px                                    | 400  | 1,5                      |
| Metadatos, pies             | 13–14 px                                 | 400  | 1,45                     |

Reglas: titulares de dos líneas como máximo en cualquier ancho (cortes escritos con `<br>`);
mayúscula solo inicial; sin etiquetas en mayúsculas ni antetítulos, sin monoespaciada, sin
numeraciones 01/02/03 (un `<ol>` real donde importa el orden); `font-variant-numeric: tabular-nums`
en toda cifra que se alinea (`.num`); comillas latinas «», puntos suspensivos reales y guion
semicorto en los rangos.

## 4. Componentes

**Botones** (`src/styles/base.css`). Esquinas rectas, un solo relleno, 48 px de alto (44 px en
tarjetas), con el nombre de la acción. `btn-primary` azul (uno por pantalla), `btn-ink` negro,
`btn-outline` anillo interior de 2 px, `btn-field` mostaza sobre tinta, `btn-danger` para confirmar
el borrado, `btn-text` subrayado. Al pulsar: `scale(0.97)` en 140 ms. El _hover_ solo con
`(hover: hover)`. Deshabilitado: relleno gris, texto legible y el motivo escrito al lado
(`.action-reason`).

**Opciones** (cuestionario). Radios y casillas nativos, presentes para lectores de pantalla,
superpuestos a una fila completa (`.option`) sobre `--paper-step`; marcado = fondo tinta y texto
blanco; foco = contorno azul de 3 px. Fichas (`.options-chips`) para selección múltiple. Áreas de
texto con borde de 1 px, rectas y contador de caracteres.

**Ranura de foto.** Título y estado (Pendiente / Lista / Revísala / No se puede usar), marco 4:5
(maniquí sin pelo si está vacía, la foto si está llena), qué muestra esa vista, avisos como filas
pálidas y acciones: Elegir foto / Hacer foto → Sustituir / Repetir con la cámara / Eliminar.

**Tarjeta de recomendación.** Banda mostaza con los dibujos de frente y perfil; línea de datos
(longitud · estéticas); nombre; corte base si cambia el nombre; cifra de 36 px con su banda y
«compatibilidad estimada»; datos (min/día, dificultad, cada cuánto cortar); justificación;
desplegable «Por qué esta puntuación» con la tabla de factores; «Ver cómo te queda» cuando la
simulación está disponible; acciones al pie (Ver ficha, Guardar, Comparar). Las tarjetas de una
fila comparten altura.

**Desglose de la puntuación.** `<table>` real: factor, peso, barra de cuatro pasos con palabras y
`n/4`, motivo. Los factores no evaluados muestran «—» y «No evaluado». La nota inferior explica la
fórmula.

**Pestañas y filtros.** Pestañas subrayadas (2 px tinta) con su recuento; filtros como selectores
etiquetados y una casilla, reflejados en la URL (`?longitud=medio&tiempo=10&estetica=natural`).

**Avisos.** Aviso (ámbar pálido con filo) para el modo demostración y servicios no disponibles;
bloque de error (rojo pálido) dentro de la pantalla que falló; bloque vacío (`--paper-step`) con la
siguiente acción.

**Diálogos.** `<dialog>` nativo (foco atrapado, Escape cierra), recto; junto con la barra flotante
de comparación, es lo único con sombra.

**Ficha de cabeza** (`src/figures`): ver §7.

## 5. Maquetación

- Marco de la portada: un único par de márgenes `clamp(16px, 2.2vw, 32px)`; las secciones van a
  sangre; separación entre secciones `clamp(96px, 12vw, 200px)`.
- Orden de la portada (el argumento): héroe (ventana-espejo) → cuatro capítulos (Mira, Gira, Cuenta,
  Pide) → escaparate (Corto, medio y largo: tarjetas que cruzan un campo de pelo dibujado) → tabla
  del catálogo con filtro interactivo → preguntas con un único panel de respuesta → banda azul
  «Empieza» → pie con el nombre recortado.
- Estudio: barra de 56 px sobre mostaza; hoja a 8 px a derecha, izquierda y abajo; columna de
  contenido de 1088 px como máximo; 28–40 px de margen superior; en las pantallas de dos columnas el
  trabajo va a la izquierda y su contexto a la derecha (consejos junto a las fotos, «Tu ficha» junto
  a las preguntas, fotos junto a la revisión).
- Espaciado en pasos de 4 px: 8, 12, 16, 24, 32, 48, 56.

## 6. Profundidad y elevación

Plano. Las superficies se separan por un paso de tono (`--paper-step`) o una línea de 1 px
(`--edge`), nunca ambas, nunca una sombra en reposo. Solo lleva sombra lo que flota: diálogos
(`0 24px 64px / .28`) y la barra de comparación.

## 7. Imágenes: los dibujos de ficha

Sin fotografía de archivo. Las colecciones abiertas de imágenes no eran accesibles desde el entorno
de construcción, y fotos de desconocidos con un corte representarían mal una recomendación. En su
lugar, cada corte **se dibuja a partir de parámetros** (`shared/catalog/styles.ts → figure`,
`src/figures/geometry.ts`):

- Parámetros: altura de coronilla, ajuste lateral (piel, corto, pegado, completo, ancho), longitud
  (coronilla … espalda), flequillo (ninguno, micro, recto, cortina, lateral, texturizado, hacia
  arriba), raya, textura (liso, ondulado, rizado, afro, trenzas), capas, nuca más larga, peinado hacia
  atrás, asimetría.
- Capas, de atrás adelante: cuello y hombros, cabeza, orejas, pelo recortado por una ventana de
  rostro, mechones recortados al pelo, raya, línea de corte.
- Tres niveles de detalle: silueta; raya y rizos en el contorno; mechones y línea de corte azul con
  topes.
- El maniquí no tiene rasgos: el dibujo trata del pelo, nunca de una persona.
- Los pies dicen qué es la imagen: «Esquema de la silueta del corte; la línea azul marca dónde se
  corta. No es una simulación sobre tu cara».
- Las fotos de la persona solo aparecen dentro del estudio, como las dos vistas de su ficha.
- La simulación con IA («Ver cómo te queda») es una función aparte y con consentimiento propio
  (edición de la foto frontal con Google Gemini). Se muestra siempre junto a la original, con la
  etiqueta «Simulación con IA», un pie sobre sus límites y su marca de agua SynthID.

## 8. Movimiento

Moderado y siempre prescindible:

| Movimiento                           | Dónde                       | Cómo                                                                     |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| Firma: el espejo se abre             | Héroe, contenedor de 200svh | `clip-path: inset(... round arco)` según `--p` (progreso de scroll)      |
| Los verbos se quedan                 | Capítulos                   | `position: sticky` dentro de cada panel                                  |
| Las tarjetas cruzan el campo de pelo | Escaparate, 300svh          | `translateX` según `--p`                                                 |
| Entradas                             | Catálogo, pie               | sube 24 px + opacidad, 800 ms, 80 ms de escalonado, una vez              |
| Fundido de respuestas                | Panel de preguntas          | 150 ms                                                                   |
| Respuesta al gesto                   | Botones, opciones, enlaces  | pulsar 140 ms, color 180 ms                                              |
| Etapa en curso                       | Análisis                    | el marcador de la etapa actual late (se detiene con movimiento reducido) |

El progreso de scroll se calcula en `src/landing/motion.ts`; nunca se secuestra el scroll. Con
`prefers-reduced-motion: reduce` el héroe es una pantalla fija, el escaparate es una rejilla, no
hay entradas y toda animación termina en su estado final.

## 9. Sí y no

Sí: decir qué es cada cosa en español llano; enseñar el dibujo del corte, grande; que las fotos sean
solo de la persona; escribir el motivo junto a cada control deshabilitado y cada cifra; redondear la
compatibilidad a múltiplos de 5 y enseñar sus factores; separar lo observado, lo declarado y lo
hipotético.

No: degradados, cristal, brillos, sombras en reposo, emoji, iconos en cuadrados de color, filas de
tarjetas idénticas con icono, antetítulos en mayúsculas, etiquetas monoespaciadas, numeración
01/02/03, puntuaciones de belleza, suposiciones de género, porcentajes de progreso inventados ni un
«probador» hecho pegando pelo sobre una foto.

## 10. Comportamiento responsive

| Punto de corte | Cambio                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 1100 px      | Se oculta el lateral «Tu ficha»                                                                                                                                                         |
| ≤ 1000 px      | Los consejos de foto pasan bajo las ranuras; tarjetas de 2 en 2                                                                                                                         |
| ≤ 900 px       | La lista de pasos se convierte en «Paso · n de 5»                                                                                                                                       |
| ≤ 760 px       | Composiciones móviles de la portada: ventana de 78vw al 30 % de altura; capítulos apilados; escaparate en lista; filas del catálogo en dos líneas; respuestas de las preguntas en línea |
| ≤ 640 px       | Desaparece el marco del estudio (la hoja es la pantalla); una tarjeta por fila; filtros de 2 en 2; el desglose pasa a filas de dos líneas                                               |

Las zonas táctiles miden 44 px o más. Comprobado a 390, 768 y 1440 px.

## 11. Accesibilidad

Enlaces para saltar al contenido; un `h1` por pantalla que recibe el foco al cambiar de ruta;
controles nativos (radios, casillas, selectores, `<dialog>`, `<details>`); contorno de foco visible
de 3 px en el acento; `aria-live` para el estado de las fotos, las etapas del análisis y los
recuentos; pestañas con flechas del teclado; `aria-pressed` en Guardar; texto de 13 px o más y
contraste ≥ 4,5:1; `lang="es"`; nunca se bloquea el zoom.

## 12. Voz

Español de España, tuteo, frases cortas y afirmativas, el vocabulario del oficio (línea de corte,
peine del n.º 2, capas, flequillo cortina, desfilado). Los botones nombran la acción («Elegir foto»,
«Analizar mis fotos», «Ver cómo te queda»). Los errores dicen qué ha pasado y qué hacer; no piden
perdón.

## 13. Guía para agentes

- Fondo: `--field #e1ac10`; tinta `#0b0b0b`; un acento `#24338f`; hoja del estudio blanca con
  paneles `--paper-step #f3f3f0`.
- Tipografía: Hanken Grotesk 400/500; letra grande y apretada (-0,05em), letra pequeña a 13–16 px.
- ¿Una imagen nueva? Dibújala como ficha con `HeadSheet` y un `FigureSpec`; nunca añadas fotos de archivo.
- ¿Una pantalla nueva en el estudio? `ScreenTitle` + `.screen-lede`, el trabajo a la izquierda y su
  contexto a la derecha, `.screen-actions` con un solo `btn-primary`.

## 14. Procedencia (Taste-Skill)

- Dirección de la portada asignada con `draw.mjs --sector fashion --sections how-it-works,showcase,list,faq,cta,footer --have product-ui`:
  tres opciones (`dark-room`, `uneven-photographs`, `pinned-poster`); elegida **pinned-poster**
  (semilla 1801276998) porque una ficha de cabeza es un marco fijo sobre el que se dibujan cortes
  sucesivos. Tipografía Hanken Grotesk y paleta «Mustard and black» tal como se asignaron; sin
  redibujados.
- Estilo de aplicación asignado con `draw.mjs --app --kind report --keep palette,type`: elegido
  **framed-sheet** (semilla 2130946853); su «cara» es el marco teñido de la mostaza de la marca y su
  elemento propio, las fotos de la persona como las dos vistas de su ficha.
- Desviación: la hoja pedía imágenes reales de colecciones abiertas; Openverse, Wikimedia Commons,
  el Art Institute of Chicago, el Met y picsum no eran accesibles desde el entorno, así que las
  imágenes se dibujan en código (regla 4 de imagen) y así se indica en el pie.
