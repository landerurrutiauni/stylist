import type { ReactNode } from 'react';

/** The screen's h1. Focusable so route changes can move focus to it. */
export function ScreenTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1 className="screen-title" tabIndex={-1} id={id}>
      {children}
    </h1>
  );
}
