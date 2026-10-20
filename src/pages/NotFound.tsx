import { Link } from 'react-router';
import { Wordmark } from '../ui/Wordmark.tsx';

export function NotFound() {
  return (
    <div className="doc-page">
      <header className="doc-bar">
        <Link to="/" aria-label="FOLIA, inicio">
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="doc doc-notfound" tabIndex={-1}>
        <h1 tabIndex={-1}>Esta página no existe</h1>
        <p className="doc-lede">El enlace puede estar mal escrito o pertenecer a una versión anterior de FOLIA.</p>
        <div className="screen-actions">
          <Link to="/" className="btn btn-ink">
            Ir al inicio
          </Link>
          <Link to="/estudio/fotos" className="btn btn-outline">
            Empezar con mis fotos
          </Link>
        </div>
      </main>
    </div>
  );
}
