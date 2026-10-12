import { useAppState } from '../state/app';
import { DICTIONARIES, type Dictionary } from './index';

/** The dictionary for the player's language. */
export function useT(): Dictionary {
  return DICTIONARIES[useAppState(state => state.settings.language)];
}
