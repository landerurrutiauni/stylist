import { useId, useMemo } from 'react';
import type { FigureSpec } from '../../shared/catalog/styles.ts';
import { buildFigure, VIEWBOX, type View } from './geometry.ts';

export type Surface = 'field' | 'paper';

interface Props {
  spec: FigureSpec;
  view?: View;
  /** The ground the drawing sits on: the mustard field or the white sheet. */
  surface?: Surface;
  /** Draw the blue cut line. */
  showCut?: boolean;
  /** Draw the hair; false leaves the bare mannequin of an empty head sheet. */
  hair?: boolean;
  /** Accessible description; omit to mark the drawing as decorative. */
  label?: string;
  className?: string;
}

/**
 * One view of a head sheet: the mannequin and the cut's silhouette, in flat
 * tone steps, with the cut line in the accent blue.
 */
export function HeadSheet({ spec, view = 'front', surface = 'paper', showCut = true, hair = true, label, className }: Props) {
  const id = useId().replace(/:/g, '');
  const parts = useMemo(() => buildFigure(spec, view), [spec, view]);
  const head = surface === 'field' ? 'var(--draw-head-field)' : 'var(--draw-head-paper)';
  const shade = surface === 'field' ? 'var(--draw-shade-field)' : 'var(--draw-shade-paper)';

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <mask id={`w${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="500">
          <rect width="400" height="500" fill="#fff" />
          <path d={parts.window} fill="#000" />
        </mask>
        <clipPath id={`h${id}`}>
          <path d={parts.hair} />
        </clipPath>
      </defs>
      <path d={parts.neck} fill={head} />
      <path d={parts.neckShade} fill={shade} />
      <path d={parts.head} fill={head} />
      {parts.ears.map((ear) => (
        <path key={ear} d={ear} fill={shade} />
      ))}
      {hair ? (
        <g mask={`url(#w${id})`}>
          <path d={parts.hair} fill="var(--draw-hair)" />
          {parts.curls.map((curl, index) => (
            <circle key={index} cx={curl.cx} cy={curl.cy} r={curl.r} fill="var(--draw-hair)" />
          ))}
          <g
            clipPath={`url(#h${id})`}
            fill="none"
            stroke="var(--draw-hair-lit)"
            strokeWidth={spec.texture === 'coily' ? 1.4 : 1.8}
            strokeLinecap="round"
          >
            {parts.strands.map((strand, index) => (
              <path key={index} d={strand} />
            ))}
          </g>
        </g>
      ) : null}
      {hair && parts.part ? <path d={parts.part} fill="none" stroke={head} strokeWidth="2.4" strokeLinecap="round" /> : null}
      {hair && showCut ? <path d={parts.cut.d} fill="none" stroke="var(--draw-cut)" strokeWidth="3.2" strokeLinecap="square" /> : null}
    </svg>
  );
}

export function cutLabel(spec: FigureSpec, view: View = 'front'): string {
  return buildFigure(spec, view).cut.label;
}
