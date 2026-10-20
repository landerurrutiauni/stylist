import type { FigureSpec } from '../../shared/catalog/styles.ts';
import { HeadSheet } from '../figures/HeadSheet.tsx';

const BARE: FigureSpec = { top: 0, sides: 'skin', length: 'crown', fringe: 'none', part: 'none', texture: 'straight', layers: 'none' };

interface Mark {
  label: string;
  /** Position of the label in % of the figure box. */
  x: number;
  y: number;
  side: 'left' | 'right';
}

const FRONT_MARKS: Mark[] = [
  { label: 'Frente', x: 50, y: 27, side: 'right' },
  { label: 'Pómulos', x: 70, y: 46, side: 'right' },
  { label: 'Contorno', x: 30, y: 52, side: 'left' },
  { label: 'Mandíbula', x: 66, y: 63, side: 'right' },
  { label: 'Mentón', x: 50, y: 74, side: 'left' },
];

const PROFILE_MARKS: Mark[] = [
  { label: 'Línea del perfil', x: 30, y: 50, side: 'left' },
  { label: 'Mandíbula', x: 58, y: 70, side: 'right' },
  { label: 'Mentón', x: 38, y: 69, side: 'left' },
  { label: 'Nuca', x: 70, y: 62, side: 'right' },
];

/** A blank head sheet with what each photo lets FOLIA see, marked in the cut-line blue. */
export function AnnotatedHead({ view, surface }: { view: 'front' | 'profile'; surface: 'field' | 'paper' }) {
  const marks = view === 'front' ? FRONT_MARKS : PROFILE_MARKS;
  return (
    <div className="annotated">
      <HeadSheet spec={BARE} view={view} surface={surface} hair={false} />
      {marks.map((mark) => (
        <span key={mark.label} className={`mark mark-${mark.side}`} style={{ left: `${mark.x}%`, top: `${mark.y}%` }}>
          <span className="mark-dot" aria-hidden="true" />
          <span className="mark-label">{mark.label}</span>
        </span>
      ))}
    </div>
  );
}

/** A close field of hair strands, drawn: the material of the trade, up close. */
export function HairField() {
  const strands: string[] = [];
  for (let i = 0; i < 46; i++) {
    const x = -80 + i * 34;
    const sway = Math.sin(i * 1.7) * 60;
    const lean = Math.cos(i * 0.9) * 40;
    strands.push(`M${x},-20 C${x + 120 + sway},180 ${x - 60 + lean},420 ${x + 90 + sway * 0.5},620 S${x + 40},900 ${x + 140},1020`);
  }
  return (
    <svg className="hair-field" viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="1500" height="1000" fill="#1b170f" />
      <g fill="none" strokeLinecap="round">
        {strands.map((d, i) => (
          <path key={i} d={d} stroke={i % 3 === 0 ? '#3b3426' : i % 3 === 1 ? '#2a241a' : '#4a4232'} strokeWidth={i % 4 === 0 ? 14 : 7} />
        ))}
      </g>
    </svg>
  );
}
