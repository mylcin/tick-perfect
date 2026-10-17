import type { CloudSave } from './app-store';

// A backup is a file of everything earned, the same as an account keeps
// (no settings, no tips), saved wherever the player puts it. Restoring one
// merges it in like another device's progress: the best of both, so a
// stale backup can never take anything away.

/** Marks a file as one of this game's backups. */
const APP = 'tick-perfect';
/** Bumped if a backup's fields ever change meaning; read field by field. */
const VERSION = 1;
/** Far beyond any real backup (a few kB), so a wrong pick isn't read whole. */
export const MAX_BACKUP_BYTES = 1_000_000;

interface BackupFile {
  readonly name: string;
  readonly text: string;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** `save` as a file named for the local day: tick-perfect-2026-10-03.json. */
export function backupFile(save: CloudSave, now: Date): BackupFile {
  const day = [
    String(now.getFullYear()),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
  ].join('-');
  return {
    name: `${APP}-${day}.json`,
    text: `${JSON.stringify(
      { app: APP, version: VERSION, savedAt: now.toISOString(), ...save },
      null,
      2
    )}\n`,
  };
}

/** Why a file can't be restored: not readable, or not a backup at all. */
export type BackupError = 'unreadable' | 'foreign';

/**
 * How restoring a file went: something new merged in, nothing new, or not
 * (too large to be a backup, unreadable or not one).
 */
export type RestoreOutcome =
  'restored' | 'unchanged' | 'tooLarge' | BackupError;

type BackupReading =
  | { readonly ok: true; readonly saved: unknown }
  | { readonly ok: false; readonly error: BackupError };

/**
 * A backup's saved data, to merge in, or why there is none. Its fields are
 * checked as they are merged (see restoreSaved); a newer version's backup
 * is read the same way, keeping what this version understands.
 */
export function readBackup(text: string): BackupReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'unreadable' };
  }
  const isBackup =
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    (parsed as Readonly<Record<string, unknown>>)['app'] === APP;
  return isBackup
    ? { ok: true, saved: parsed }
    : { ok: false, error: 'foreign' };
}
