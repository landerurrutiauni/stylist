import type { FigureSpec } from '../../shared/catalog/styles.ts';
import { HeadSheet } from '../figures/HeadSheet.tsx';

const BARE: FigureSpec = { top: 0, sides: 'skin', length: 'crown', fringe: 'none', part: 'none', texture: 'straight', layers: 'none' };

/** A visual instruction: how much of the frame the head should take, front and profile. */
export function FramingGuide() {
  return (
    <figure className="framing">
      <div className="framing-pair" aria-hidden="true">
        {(['front', 'profile'] as const).map((view) => (
          <div key={view} className="framing-frame">
            <HeadSheet spec={BARE} view={view} surface="paper" hair={false} />
            <span className="framing-top" />
            <span className="framing-eye" />
          </div>
        ))}
      </div>
      <figcaption>Encuadre: la cabeza entera con aire por encima, los hombros dentro y la cámara a la altura de los ojos (línea azul).</figcaption>
    </figure>
  );
}
