import { useEffect, type RefObject } from 'react';

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Writes the scroll progress through a tall wrapper (0 at its top, 1 when its
 * bottom reaches the viewport's bottom) into `--p` on the wrapper. Native
 * scrolling drives everything; nothing is hijacked. Under reduced motion the
 * variable stays unset and the CSS shows the finished composition.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      element.style.setProperty('--p', progress.toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * Section entrances: elements with `data-reveal` rise into place once when
 * they enter the viewport. The hidden state only exists while the root has
 * the `motion` class, so without JavaScript or under reduced motion
 * everything is simply visible.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    container.classList.add('motion');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    container.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      container.classList.remove('motion');
    };
  }, [root]);
}
