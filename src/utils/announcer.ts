import { createObservable, type Observable } from './observable';

interface Announcement {
  readonly text: string;
  /** Interrupts whatever the screen reader is saying. */
  readonly urgent: boolean;
  /** Counts up, so the same text can be announced twice in a row. */
  readonly id: number;
  /** When it was made, on the page's clock. */
  readonly at: number;
}

const latest = createObservable<Announcement | null>(null);
let count = 0;

/** Reads `text` out to screen readers through the page's live regions. */
export function announce(text: string, urgent = false): void {
  count += 1;
  latest.set({ text, urgent, id: count, at: performance.now() });
}

export const announcements: Observable<Announcement | null> = latest;

const hosts = createObservable<readonly HTMLElement[]>([]);

/**
 * Moves the live regions into `element`, an open modal dialog: the browser
 * makes everything outside it inert, live regions too, so they would say
 * nothing. Call the returned function as the dialog closes.
 */
export function hostAnnouncements(element: HTMLElement): () => void {
  hosts.set([...hosts.get(), element]);
  return () => {
    hosts.set(hosts.get().filter(host => host !== element));
  };
}

/** Where the live regions belong: the top open dialog, or null for the page. */
export const announcementHost: Observable<HTMLElement | null> = {
  get: () => hosts.get().at(-1) ?? null,
  subscribe: listener =>
    hosts.subscribe(stack => {
      listener(stack.at(-1) ?? null);
    }),
};
