/** A value that can be read at any time and watched for changes. */
export interface Observable<T> {
  get(): T;
  /** Calls `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
}

interface Writable<T> extends Observable<T> {
  set(value: T): void;
}

/**
 * A tiny observable value. Per-frame or per-hit data (the score on the date
 * wheel) flows through it into the 3D scene without re-rendering React.
 */
export function createObservable<T>(initial: T): Writable<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach(listener => {
        listener(value);
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
