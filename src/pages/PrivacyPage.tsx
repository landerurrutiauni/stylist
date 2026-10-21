import { Link } from 'react-router';
import { Wordmark } from '../ui/Wordmark.tsx';

/** How FOLIA handles photos and answers, step by step, with the providers named. */
export function PrivacyPage() {
  return (
    <div className="doc-page">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="doc-bar">
        <Link to="/" aria-label="FOLIA, inicio">
          <Wordmark />
        </Link>
        <Link to="/estudio/fotos" className="btn btn-ink">
          Empezar
        </Link>
      </header>
      <main id="main" className="doc" tabIndex={-1}>
        <h1 tabIndex={-1}>Privacidad</h1>
        <p className="doc-lede">
          Qué pasa con tus fotos y tus respuestas en cada paso, quién las recibe y qué no podemos prometer. Revisado el 20 de octubre de 2026.
        </p>

        <h2>En tu navegador</h2>
        <p>
          Cuando eliges o haces una foto, FOLIA la abre en tu navegador, la reduce a 1600 px como máximo y la vuelve a codificar en JPEG. Al hacerlo
          desaparecen los metadatos del archivo original: ubicación GPS, fecha, modelo del móvil. Las fotos, tus respuestas y los resultados se
          guardan solo en la memoria de la pestaña: FOLIA no usa cookies, localStorage, sessionStorage ni IndexedDB para ellos. Recargar la página,
          cerrar la pestaña o pulsar «Borrar sesión» los elimina.
        </p>

        <h2>El análisis</h2>
        <p>
          Solo si aceptas el consentimiento, las dos fotos y tus respuestas viajan cifradas (HTTPS) al servidor de FOLIA, que comprueba que son
          imágenes válidas y las reenvía a <strong>Anthropic</strong>, la empresa que desarrolla Claude, mediante su API. El servidor procesa la
          petición en memoria: no guarda las fotos ni las respuestas, y los registros que escribe FOLIA solo contienen datos técnicos (duración,
          número de recomendaciones, códigos de error), nunca imágenes, respuestas ni direcciones IP. La plataforma que aloja el servidor mantiene
          además sus propios registros técnicos de cada petición, como cualquier servicio web.
        </p>
        <p>
          Según el centro de privacidad de Anthropic (revisado en octubre de 2026), las entradas y salidas de su API se borran automáticamente en un
          plazo de 30 días y no se usan para entrenar modelos salvo que el cliente lo permita. Anthropic puede conservarlas más tiempo si la ley lo
          exige o si sus sistemas automáticos de seguridad marcan la petición como contraria a su política de uso, en cuyo caso hasta dos años. Quien
          publique FOLIA puede acordar con Anthropic una retención cero. FOLIA no controla ni puede garantizar ese tratamiento.
        </p>

        <h2>La simulación de cómo te queda</h2>
        <p>
          Claude no genera imágenes. Si pides ver un corte sobre tu foto, y solo tras un segundo consentimiento que nombra al servicio, tu foto
          frontal y la descripción del corte se envían a un modelo de edición de imagen, que devuelve tu foto con el pelo cambiado. FOLIA no guarda ni
          la foto ni la imagen generada, y la imagen se marca siempre como simulación generada por IA. El servicio depende de cómo esté configurado el
          servidor:
        </p>
        <ul>
          <li>
            <strong>Cloudflare Workers AI</strong> (modelo FLUX.2 [klein] de Black Forest Labs). Recibe una copia de tu foto reducida a 512 px. Según
            su documentación, Cloudflare no conserva lo que recibe ni lo que genera una vez terminada la petición y no lo usa para entrenar modelos.
          </li>
          <li>
            <strong>Google</strong>, a través de la API de Gemini. FOLIA pide a Google que no almacene la interacción; según su documentación, Google
            conserva durante 55 días los datos necesarios para detectar infracciones de su política de uso, y en los proyectos de pago no usa el
            contenido para mejorar sus productos. La imagen lleva una marca de agua invisible (SynthID).
          </li>
        </ul>

        <h2>Límites de uso</h2>
        <p>
          Para evitar abusos, el servidor limita cuántos análisis y simulaciones se pueden pedir por hora. Para contarlos usa un resumen cifrado (hash
          con sal) de tu dirección IP, que se borra a los dos días; la dirección en sí no se guarda.
        </p>

        <h2>Lo que FOLIA no hace</h2>
        <ul>
          <li>No identifica a nadie ni compara tu cara con otras.</li>
          <li>No deduce tu género, edad, origen, salud ni personalidad.</li>
          <li>No puntúa tu atractivo: la compatibilidad mide el encaje entre un corte y lo que se ve y lo que cuentas.</li>
          <li>No usa tus fotos para nada distinto de tu análisis y las simulaciones que pidas.</li>
        </ul>

        <h2>Para quien publique FOLIA</h2>
        <p>
          Una casilla de consentimiento no basta para cumplir el RGPD. Las fotos de la cara son datos personales y el análisis implica una
          transferencia internacional a proveedores en Estados Unidos. Antes de abrir el servicio al público hay que identificar al responsable del
          tratamiento, firmar los acuerdos de encargo con los proveedores, valorar una evaluación de impacto y publicar un aviso de privacidad
          completo. La documentación del repositorio lo detalla.
        </p>

        <p className="doc-back">
          <Link to="/">Volver al inicio</Link>
        </p>
      </main>
    </div>
  );
}
