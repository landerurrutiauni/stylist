import { Link } from 'react-router';
import { ScreenTitle } from '../../ui/ScreenTitle.tsx';
import { useStartExample } from './useExample.ts';

/** Shown when a results address is opened without an analysis in memory (a reload, a shared link). */
export function NoResults() {
  const startExample = useStartExample();
  return (
    <div className="screen screen-empty">
      <header className="screen-head">
        <ScreenTitle>No hay resultados en esta sesión</ScreenTitle>
        <p className="screen-lede">
          FOLIA guarda tus fotos y tus resultados solo en la memoria de esta pestaña. Si recargas la página o abres el enlace en otra, se borran: así
          nada tuyo queda guardado en el navegador.
        </p>
      </header>
      <div className="screen-actions">
        <Link to="/estudio/fotos" className="btn btn-primary">
          Empezar con mis fotos
        </Link>
        <button type="button" className="btn btn-outline" onClick={startExample}>
          Ver un ejemplo
        </button>
      </div>
    </div>
  );
}
