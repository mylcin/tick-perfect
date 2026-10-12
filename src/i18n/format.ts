import type { Dictionary } from './dictionary';

/** "Tourbillon and Endless", "Tourbillon ve Endless". */
export function listOf(t: Dictionary, items: readonly string[]): string {
  return new Intl.ListFormat(t.locale, {
    style: 'long',
    type: 'conjunction',
  }).format(items);
}
