import { CATALOG } from '../../../shared/catalog/styles.ts';
import { HeadSheet, cutLabel } from '../../figures/HeadSheet.tsx';

/** Development-only sheet of every catalogue drawing, to review the figures. */
export default function FiguresPage() {
  return (
    <main style={{ padding: 24, background: 'var(--paper)', color: 'var(--ink)' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Figuras del catálogo</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
        {CATALOG.map((style) => (
          <figure key={style.id} style={{ margin: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--field)' }}>
              <HeadSheet spec={style.figure} view="front" surface="field" />
              <HeadSheet spec={style.figure} view="profile" surface="field" />
            </div>
            <figcaption style={{ fontSize: 14, paddingTop: 6 }}>
              {style.name} · {cutLabel(style.figure)} · <code>{style.id}</code>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
