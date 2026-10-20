/**
 * The FOLIA mark: an arch, the outline of a salon mirror and of the top of a
 * head, crossed by the blue cut line, next to the name.
 */
export function Wordmark({ withName = true }: { withName?: boolean }) {
  return (
    <span className="wordmark" translate="no">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true" focusable="false">
        <path d="M18 58V30c0-9.5 6.3-17 14-17s14 7.5 14 17v28" fill="none" stroke="currentColor" strokeWidth="7" />
        <path d="M10 45h44" stroke="var(--accent)" strokeWidth="5" />
      </svg>
      {withName ? <span className="wordmark-name">FOLIA</span> : null}
    </span>
  );
}
