import type { Dictionary } from './dictionary';
import { en } from './en';
import type { Language } from './languages';
import { tr } from './tr';

export type { Dictionary, TwistHint } from './dictionary';
export * from './languages';

export const DICTIONARIES: Readonly<Record<Language, Dictionary>> = { en, tr };
