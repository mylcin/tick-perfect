import type { Deps } from './deps.js';

// Switches an admin can flip without a deploy, each with its default and
// the values it accepts.

export const SETTINGS = {
  /** Shows the boards, and takes ranked rounds. */
  'leaderboard.enabled': {
    fallback: true as boolean,
    accepts: (value: unknown) => typeof value === 'boolean',
  },
  /** Takes new rounds and scores; off, the boards stay up, read-only. */
  'submissions.enabled': {
    fallback: true as boolean,
    accepts: (value: unknown) => typeof value === 'boolean',
  },
  /** A line shown over the boards, or null. */
  announcement: {
    fallback: null as string | null,
    accepts: (value: unknown) =>
      value === null || (typeof value === 'string' && value.length <= 200),
  },
} as const;

type SettingKey = keyof typeof SETTINGS;
type Settings = {
  -readonly [Key in SettingKey]: (typeof SETTINGS)[Key]['fallback'];
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** Every setting, saved or default. */
export async function readSettings(deps: Deps): Promise<Settings> {
  const rows = await deps.sql.query<{ key: string; value: unknown }>(
    'select key, value from game.app_settings'
  );
  const settings: Settings = {
    'leaderboard.enabled': SETTINGS['leaderboard.enabled'].fallback,
    'submissions.enabled': SETTINGS['submissions.enabled'].fallback,
    announcement: SETTINGS.announcement.fallback,
  };
  for (const { key, value } of rows) {
    if (isSettingKey(key) && SETTINGS[key].accepts(value)) {
      Object.assign(settings, { [key]: value });
    }
  }
  return settings;
}
