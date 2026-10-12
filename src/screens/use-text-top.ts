import { useLayoutEffect, type RefObject } from 'react';

import { sessionStore } from '../state/session';

/** Where an element starts down the page, untouched by its transforms. */
function topOf(element: HTMLElement): number {
  let top = 0;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.offsetParent as HTMLElement | null
  ) {
    top += node.offsetTop;
  }
  return top;
}

/**
 * Reports where the text under the watch starts (inside the element's top
 * padding, which its shade fades through), as it grows, shrinks or moves
 * with the screen, so the 3D framing keeps the watch above it.
 */
export function useTextTop(text: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = text.current;
    if (!element) return;
    const { setTextTop } = sessionStore.getState();
    const measure = () => {
      const padding = Number.parseFloat(getComputedStyle(element).paddingTop);
      setTextTop(
        (topOf(element) + (padding || 0)) / Math.max(window.innerHeight, 1)
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      setTextTop(null);
    };
  }, [text]);
}
