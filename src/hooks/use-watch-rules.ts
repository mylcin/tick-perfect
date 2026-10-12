import type { GameRules } from '../game';
import { useOnline } from '../online';
import { WATCHES, type WatchId } from '../watches';

/**
 * The rules a watch is played by: the server's once the page has adopted
 * them (an admin can tune a watch without a deploy), else its own.
 */
export function useWatchRules(watch: WatchId): GameRules {
  const live = useOnline(state => state.adopted?.seasons[watch]?.rules ?? null);
  return live ?? WATCHES[watch].rules;
}
