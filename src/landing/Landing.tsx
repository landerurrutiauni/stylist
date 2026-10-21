import { useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CATALOG, getStyle } from '../../shared/catalog/styles.ts';
import { aestheticLabels, lengthCategoryLabels, type LengthCategory } from '../../shared/labels.ts';
import { HeadSheet } from '../figures/HeadSheet.tsx';
import { useStartExample } from '../studio/results/useExample.ts';
import { Wordmark } from '../ui/Wordmark.tsx';
import { AnnotatedHead, HairField } from './drawings.tsx';
import { useReveal, useScrollProgress } from './motion.ts';

const HERO_STYLE = getStyle('curtain-shag')!;
const SHOWCASE = ['textured-crop', 'pixie-long-fringe', 'curtain-shag', 'curly-bob', 'long-curls'].map((id) => getStyle(id)!);
const CARD_TONES = ['#c8b98e', '#cfc6b0', '#bfc2b5', '#c9b07a', '#bdb6a8'];

const VERBS = [
  {
    verb: 'Mira',
    tone: 'verb-field',
    text: 'Una foto de frente, con luz uniforme y la cara despejada: contorno, frente, pómulos, mandíbula y mentón.',
  },
  {
    verb: 'Gira',
    tone: 'verb-ink',
    text: 'Otra de perfil, para la línea del perfil, la mandíbula y la nuca. Lo que una foto no enseña, FOLIA no lo inventa.',
  },
  {
    verb: 'Cuenta',
    tone: 'verb-paper',
    text: 'Nueve preguntas, cinco obligatorias, sobre tu pelo, tu tiempo por las mañanas y lo que no quieres repetir.',
  },
  {
    verb: 'Pide',
    tone: 'verb-step',
    text: 'Cada corte llega con lo que hay que pedir: centímetros, número de peine y cada cuánto volver. Y, si quieres, una simulación sobre tu foto.',
  },
];

const FAQ = [
  {
    q: '¿Qué pasa con mis fotos?',
    a: 'Se quedan en tu navegador hasta que aceptas enviarlas. Para el análisis viajan reducidas y sin metadatos al servidor de FOLIA, que las pasa a Anthropic y no guarda nada.',
  },
  {
    q: '¿Quién ve las imágenes?',
    a: 'Ninguna persona de FOLIA. Las procesa el modelo Claude de Anthropic durante el análisis. Si pides una simulación, tu foto frontal va también a Google, y te lo preguntamos antes.',
  },
  {
    q: '¿Qué significa la compatibilidad?',
    a: 'Una cifra orientativa de 0 a 100 que resume cinco factores: rasgos visibles, tipo de pelo, gustos, rutina y objetivos. Cada uno lleva su motivo. No mide tu atractivo.',
  },
  {
    q: '¿Puedo ver cómo me quedaría?',
    a: 'Sí, si el servidor tiene activada la simulación: con tu permiso, un modelo de imagen edita tu foto frontal cambiando solo el pelo. Es una aproximación, marcada como generada por IA.',
  },
  {
    q: '¿Necesito saber mi tipo de rizo?',
    a: 'No. Puedes responder «No estoy seguro»: FOLIA lo trata como un dato desconocido y baja la confianza de los cortes que dependen de él, en vez de adivinarlo por la foto.',
  },
  {
    q: '¿Por qué me pregunta qué estilos explorar?',
    a: 'Porque FOLIA no deduce tu género de las fotos. Tú eliges si quieres ver cortes masculinos, femeninos, andróginos, una mezcla o todos.',
  },
];

const TEXTURE_FILTERS = [
  { value: 'any', label: 'Cualquiera' },
  { value: 'straight', label: 'Liso' },
  { value: 'wavy', label: 'Ondulado' },
  { value: 'curly', label: 'Rizado' },
  { value: 'coily', label: 'Afro' },
] as const;

const TIME_FILTERS = [
  { value: 'any', label: 'Sin límite' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '20', label: '20 min' },
] as const;

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const startExample = useStartExample();
  useScrollProgress(ref);
  return (
    <section ref={ref} className="hero" aria-labelledby="hero-title">
      <div className="hero-stage">
        <div className="hero-picture" aria-hidden="true">
          <div className="hero-sheet">
            <div className="hero-note hero-note-left">
              <p>Capas cortas en la coronilla, medias alrededor de la cara</p>
              <p>Flequillo cortina: abre desde el centro y llega al pómulo</p>
            </div>
            <HeadSheet spec={HERO_STYLE.figure} view="front" surface="field" className="hero-front" />
            <HeadSheet spec={HERO_STYLE.figure} view="profile" surface="field" className="hero-profile" />
            <div className="hero-note hero-note-right">
              <p>Línea de corte a los hombros, puntas desfiladas</p>
              <p>Corte cada 8 semanas · unos 10 minutos al día</p>
            </div>
          </div>
        </div>
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title">
            Dos fotos,
            <br /> tu corte
          </h1>
          <div className="hero-side">
            <p className="hero-lede">
              FOLIA estudia una foto de frente y otra de perfil junto a tus respuestas y te propone cortes cortos, medios y largos, explicados para tu
              peluquería.
            </p>
            <div className="hero-actions">
              <Link to="/estudio/fotos" className="btn btn-primary">
                Empezar con mis fotos
              </Link>
              <button type="button" className="btn-text" onClick={startExample}>
                Ver un ejemplo
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Verbs() {
  return (
    <section id="como-funciona" className="verbs" aria-labelledby="verbs-title">
      <h2 id="verbs-title" className="visually-hidden">
        Cómo funciona
      </h2>
      <ol className="verbs-list">
        {VERBS.map((item, index) => (
          <li key={item.verb} className={`verb-panel ${item.tone}`} data-reveal>
            <div className="verb-picture">
              {index === 0 ? <AnnotatedHead view="front" surface="field" /> : null}
              {index === 1 ? <AnnotatedHead view="profile" surface="field" /> : null}
              {index === 2 ? <QuestionFragment /> : null}
              {index === 3 ? <TicketFragment /> : null}
            </div>
            <p className="verb-word" aria-hidden="true">
              {item.verb}
            </p>
            <p className="verb-text">
              <span className="visually-hidden">{item.verb}. </span>
              {item.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A real fragment of the questionnaire, at its true size. */
function QuestionFragment() {
  return (
    <div className="fragment fragment-question" data-ui aria-hidden="true">
      <p className="fragment-count">Pregunta 2 de 9</p>
      <p className="fragment-title">¿Cómo es tu pelo?</p>
      <ul>
        <li>Liso</li>
        <li className="is-selected">Ondulado</li>
        <li>Rizado</li>
        <li>Muy rizado o afro</li>
        <li>No estoy seguro</li>
      </ul>
    </div>
  );
}

/** A real fragment of the salon ticket a recommendation produces. */
function TicketFragment() {
  const style = getStyle('curtain-shag')!;
  return (
    <div className="fragment fragment-ticket" data-ui aria-hidden="true">
      <p className="fragment-count">Qué pedir en la peluquería</p>
      <p className="fragment-title">{style.name}</p>
      <p>{style.barber}</p>
      <p className="fragment-meta">
        Unos {style.minutes} min al día · corte cada {style.cadence[0]} semanas
      </p>
    </div>
  );
}

function Showcase() {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref);
  return (
    <section ref={ref} id="cortes" className="showcase" aria-labelledby="showcase-title">
      <div className="showcase-stage">
        <div className="showcase-ground" aria-hidden="true">
          <HairField />
        </div>
        <h2 id="showcase-title" className="showcase-title">
          Corto, medio y largo
        </h2>
        <ul className="showcase-track">
          {SHOWCASE.map((style, index) => (
            <li key={style.id} className="showcase-card">
              <div className="showcase-figure">
                <HeadSheet spec={style.figure} view="front" surface="field" label={`Esquema frontal de ${style.name}`} />
                <HeadSheet spec={style.figure} view="profile" surface="field" label={`Esquema de perfil de ${style.name}`} />
              </div>
              <div className="showcase-panel" style={{ background: CARD_TONES[index] }}>
                <h3>{style.name}</h3>
                <p>{style.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LineUp() {
  const [texture, setTexture] = useState<(typeof TEXTURE_FILTERS)[number]['value']>('any');
  const [time, setTime] = useState<(typeof TIME_FILTERS)[number]['value']>('any');
  const id = useId();
  const fits = (style: (typeof CATALOG)[number]) =>
    (texture === 'any' || style.textures.includes(texture)) && (time === 'any' || style.minutes <= Number(time));
  const count = CATALOG.filter(fits).length;
  const textureWord = TEXTURE_FILTERS.find((item) => item.value === texture)!.label.toLowerCase();
  const summary =
    texture === 'any' && time === 'any'
      ? `Los ${CATALOG.length} cortes que conoce FOLIA`
      : `${count} de ${CATALOG.length} cortes encajan${texture !== 'any' ? ` con pelo ${textureWord}` : ''}${time !== 'any' ? ` y hasta ${time} minutos al día` : ''}`;

  return (
    <section className="lineup" aria-labelledby="lineup-title" data-reveal>
      <h2 id="lineup-title" className="lineup-title">
        El catálogo
      </h2>
      <p className="lineup-lede">FOLIA solo recomienda cortes que sabe describir a un peluquero. Prueba con tu pelo y tu tiempo:</p>
      <div className="lineup-filters">
        <fieldset className="segmented">
          <legend>Tu pelo</legend>
          {TEXTURE_FILTERS.map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name={`${id}-texture`}
                value={item.value}
                checked={texture === item.value}
                onChange={() => setTexture(item.value)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="segmented">
          <legend>Tiempo al día</legend>
          {TIME_FILTERS.map((item) => (
            <label key={item.value}>
              <input type="radio" name={`${id}-time`} value={item.value} checked={time === item.value} onChange={() => setTime(item.value)} />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <p className="lineup-count num" aria-live="polite">
        {summary}
      </p>
      <table className="lineup-table">
        <caption className="visually-hidden">Catálogo de cortes de FOLIA con su estética, tiempo de peinado y cada cuánto cortar</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Corte</th>
            <th scope="col">Estética</th>
            <th scope="col">Tiempo al día</th>
            <th scope="col">Cada cuánto cortar</th>
          </tr>
        </thead>
        {(['short', 'medium', 'long'] as LengthCategory[]).map((length) => {
          const rows = CATALOG.filter((style) => style.length === length && fits(style));
          return (
            <tbody key={length}>
              <tr className="lineup-group">
                <th scope="colgroup" colSpan={4}>
                  {lengthCategoryLabels[length]}
                </th>
              </tr>
              {rows.length === 0 ? (
                <tr className="lineup-empty">
                  <td colSpan={4}>Ningún corte {lengthCategoryLabels[length].toLowerCase()} con esa combinación.</td>
                </tr>
              ) : (
                rows.map((style) => (
                  <tr key={style.id}>
                    <th scope="row">{style.name}</th>
                    <td>
                      {style.aesthetics
                        .slice(0, 2)
                        .map((key) => aestheticLabels[key])
                        .join(', ')}
                    </td>
                    <td className="num">{style.minutes} min</td>
                    <td className="num">
                      {style.cadence[0] === style.cadence[1] ? style.cadence[0] : `${style.cadence[0]}–${style.cadence[1]}`} sem.
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          );
        })}
      </table>
    </section>
  );
}

function Questions() {
  const [selected, setSelected] = useState(0);
  const id = useId();
  return (
    <section className="faq" aria-labelledby="faq-title" data-reveal>
      <div className="faq-list">
        <h2 id="faq-title" className="faq-title">
          Tus dudas
        </h2>
        <ul>
          {FAQ.map((item, index) => (
            <li key={item.q} className={index === selected ? 'is-selected' : undefined}>
              <button
                type="button"
                aria-expanded={index === selected}
                aria-controls={`${id}-answer-${index}`}
                onClick={() => setSelected(index)}
                onMouseEnter={() => setSelected(index)}
                onFocus={() => setSelected(index)}
              >
                <span className="faq-dot" aria-hidden="true" />
                {item.q}
              </button>
              <p id={`${id}-answer-${index}`} className="faq-inline" hidden={index !== selected}>
                {item.a}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="faq-pane" aria-live="polite">
        <p key={selected}>{FAQ[selected]!.a}</p>
      </div>
    </section>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const erased = (location.state as { notice?: string } | null)?.notice === 'erased';
  useReveal(root);

  return (
    <div ref={root} className="landing">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="landing-nav">
        <Link to="/" className="landing-mark" aria-label="FOLIA, inicio">
          <Wordmark />
        </Link>
        <nav aria-label="Principal">
          <ul>
            <li>
              <a href="#como-funciona">Cómo funciona</a>
            </li>
            <li>
              <a href="#cortes">Cortes</a>
            </li>
            <li>
              <Link to="/privacidad">Privacidad</Link>
            </li>
          </ul>
        </nav>
        <Link to="/estudio/fotos" className="btn btn-ink landing-nav-action">
          Empezar
        </Link>
      </header>
      {erased ? (
        <p className="erased" role="status">
          Sesión borrada: tus fotos, respuestas y resultados ya no están en este navegador.
        </p>
      ) : null}
      <main id="main" tabIndex={-1}>
        <Hero />
        <Verbs />
        <Showcase />
        <LineUp />
        <Questions />
        <Link to="/estudio/fotos" className="cta-band">
          <span className="cta-sentence">Sube tus dos fotos y responde nueve preguntas. El análisis tarda uno o dos minutos.</span>
          <svg className="cta-arrow" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="4" />
          </svg>
          <span className="cta-word">Empieza</span>
        </Link>
      </main>
      <footer className="landing-footer">
        <div className="footer-top" data-reveal>
          <div>
            <p className="footer-invite">
              Lleva la ficha
              <br /> a tu peluquería
            </p>
            <Link to="/estudio/fotos" className="btn btn-field">
              Empezar con mis fotos
            </Link>
          </div>
          <ul className="footer-links">
            <li>
              <Link to="/privacidad">Privacidad</Link>
            </li>
            <li>
              <a href="#como-funciona">Cómo funciona</a>
            </li>
            <li>
              <a href="https://github.com/landerurrutiauni/stylist">Código en GitHub</a>
            </li>
          </ul>
        </div>
        <div className="footer-credits">
          <p>Ilustraciones dibujadas en código para FOLIA. Tipografía Hanken Grotesk (SIL Open Font License).</p>
          <p>Análisis con Claude (Anthropic) · simulaciones con Gemini (Google)</p>
        </div>
        <p className="footer-name" aria-hidden="true" translate="no">
          FOLIA
        </p>
      </footer>
    </div>
  );
}
