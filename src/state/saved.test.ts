import { describe, expect, it } from 'vitest';

import { INITIAL_PROGRESS } from './progress';
import { UNWOUND } from './reserve';
import {
  DAYS_AHEAD,
  MAX_UNKNOWN_WATCHES,
  restoreSaved,
  type SavedState,
} from './saved';
import { defaultSettings } from './settings';
import { NO_TIMING } from './timegrapher';

const DEFAULTS: SavedState = {
  settings: defaultSettings(['en-US']),
  progress: INITIAL_PROGRESS,
  selected: 'diver',
  variants: {},
  daily: null,
  reserve: UNWOUND,
  timing: NO_TIMING,
  engravings: {},
  dailies: {},
  history: {},
  ghosts: { best: {}, daily: null },
  tips: [],
};

describe('restoreSaved', () => {
  it('reads back everything it saved', () => {
    const saved: SavedState = {
      settings: {
        sound: false,
        vibration: false,
        theme: 'dark',
        night: true,
        reducedMotion: true,
        batterySaver: true,
        language: 'tr',
      },
      progress: {
        best: { diver: 31 },
        unlocked: ['diver', 'chronograph'],
        points: 212,
      },
      selected: 'chronograph',
      variants: { diver: 'green', worldtimer: 'ocean' },
      daily: { number: 42, best: 23, marks: 'PPGP' },
      reserve: { days: 4, woundOn: 42 },
      timing: {
        diver: {
          count: 3,
          sum: 11.5,
          sumSquares: 70.25,
          perfects: 1,
          recent: [4, -1, 9],
        },
      },
      engravings: { 'beatError:diver': 5, escapement: 9 },
      dailies: { '41': 17, '42': 23 },
      history: {
        diver: [
          [1_790_000_000_000, 0, 31, 33, 12, -2.5, 14.1],
          [1_790_000_100_000, 1, 23, 25, 9, 1, 11],
        ],
      },
      ghosts: {
        best: { diver: { seed: 42, score: 31, taps: [612.5, 1404, 2210.25] } },
        daily: {
          seed: 7,
          score: 23,
          taps: [700],
          number: 42,
          watch: 'chronograph',
        },
      },
      tips: ['perfect', 'persist'],
    };
    expect(restoreSaved(JSON.parse(JSON.stringify(saved)), DEFAULTS)).toEqual(
      saved
    );
  });

  it.each([undefined, null, 42, 'text', [], { settings: 'x', progress: [] }])(
    'falls back to the defaults for %j',
    saved => {
      expect(restoreSaved(saved, DEFAULTS)).toEqual(DEFAULTS);
    }
  );

  it('keeps valid fields and defaults the rest', () => {
    const restored = restoreSaved(
      {
        settings: {
          sound: 'no',
          vibration: false,
          theme: 'sepia',
          night: 1,
          reducedMotion: 'yes',
          batterySaver: 'on',
          language: 'de',
        },
        progress: { best: { diver: 9 } },
      },
      DEFAULTS
    );
    expect(restored.settings).toEqual({
      ...DEFAULTS.settings,
      vibration: false,
    });
    expect(restored.progress.best).toEqual({ diver: 9 });
  });

  it.each(['system', 'light', 'dark'] as const)('keeps the theme %s', theme => {
    const restored = restoreSaved({ settings: { theme } }, DEFAULTS);
    expect(restored.settings.theme).toBe(theme);
  });

  it.each([undefined, null, 'sepia', 'Dark', 1, true, { theme: 'dark' }])(
    'follows the system for the unusable theme %j',
    theme => {
      expect(
        restoreSaved({ settings: { theme } }, DEFAULTS).settings.theme
      ).toBe('system');
    }
  );

  it('follows the system in a save from before themes', () => {
    const restored = restoreSaved(
      { settings: { night: true, language: 'tr' } },
      DEFAULTS
    );
    expect(restored.settings).toEqual({
      ...DEFAULTS.settings,
      theme: 'system',
      night: true,
      language: 'tr',
    });
  });

  it('saves no battery in a save from before battery saver', () => {
    expect(restoreSaved({ settings: {} }, DEFAULTS).settings.batterySaver).toBe(
      false
    );
    expect(
      restoreSaved({ settings: { batterySaver: true } }, DEFAULTS).settings
        .batterySaver
    ).toBe(true);
  });

  it('keeps an explicit "follow the system" motion setting', () => {
    const restored = restoreSaved(
      { settings: { reducedMotion: null } },
      { ...DEFAULTS, settings: { ...DEFAULTS.settings, reducedMotion: true } }
    );
    expect(restored.settings.reducedMotion).toBeNull();
  });

  it.each([-3, 2.5, '12', Number.NaN, null])(
    'drops the unusable best score %j',
    score => {
      expect(
        restoreSaved({ progress: { best: { diver: score } } }, DEFAULTS)
          .progress.best
      ).toEqual({});
    }
  );

  it('keeps scores for watches a newer version added, drops malformed ids', () => {
    expect(
      restoreSaved(
        {
          progress: {
            best: { diver: 4, worldtimer: 9, 'Not An Id': 3, '': 1 },
          },
        },
        DEFAULTS
      ).progress.best
    ).toEqual({ diver: 4, worldtimer: 9 });
  });

  it('keeps only a few watches it doesn’t know, so a file can’t bloat the save', () => {
    const many = Array.from({ length: 100 }, (_, i) => `future${String(i)}`);
    const restored = restoreSaved(
      {
        progress: {
          best: Object.fromEntries([...many, 'gmt'].map(id => [id, 5])),
          unlocked: ['gmt', ...many],
        },
        variants: Object.fromEntries(many.map(id => [id, 'blue'])),
      },
      DEFAULTS
    );
    expect(Object.keys(restored.progress.best)).toHaveLength(
      MAX_UNKNOWN_WATCHES + 1
    );
    expect(restored.progress.best['gmt']).toBe(5);
    expect(restored.progress.unlocked).toContain('gmt');
    expect(restored.progress.unlocked.length).toBeLessThanOrEqual(
      MAX_UNKNOWN_WATCHES + 2
    );
    expect(Object.keys(restored.variants)).toHaveLength(MAX_UNKNOWN_WATCHES);
  });

  it('always unlocks the first watch and keeps well-formed ids', () => {
    for (const unlocked of [[], 'diver', ['diver', 'diver'], [42, null]]) {
      expect(
        restoreSaved({ progress: { unlocked } }, DEFAULTS).progress.unlocked
      ).toEqual(['diver']);
    }
    expect(
      restoreSaved({ progress: { unlocked: ['worldtimer'] } }, DEFAULTS)
        .progress.unlocked
    ).toEqual(['diver', 'worldtimer']);
  });

  it('unlocks whatever the saved bests and points have earned', () => {
    expect(
      restoreSaved(
        { progress: { best: { diver: 15 }, unlocked: ['diver'], points: 150 } },
        DEFAULTS
      ).progress.unlocked
    ).toEqual(['diver', 'chronograph']);
  });

  it('keeps every watch a save from before levels had unlocked', () => {
    const progress = restoreSaved(
      {
        progress: {
          best: { diver: 20, chronograph: 16 },
          unlocked: ['diver', 'chronograph', 'gmt'],
        },
      },
      DEFAULTS
    ).progress;
    expect(progress.unlocked).toEqual(['diver', 'chronograph', 'gmt']);
    // With no points saved, its bests are the points it earned.
    expect(progress.points).toBe(36);
  });

  it.each([-5, 1.5, '300', null])('reads points of %j as none', points => {
    expect(
      restoreSaved({ progress: { best: { diver: 9 }, points } }, DEFAULTS)
        .progress.points
    ).toBe(9);
  });

  it('restores the picked watch only while it is unlocked', () => {
    const unlocked = { best: { diver: 20 }, unlocked: ['diver'], points: 150 };
    expect(
      restoreSaved({ progress: unlocked, selected: 'chronograph' }, DEFAULTS)
        .selected
    ).toBe('chronograph');
    expect(
      restoreSaved({ progress: unlocked, selected: 'gmt' }, DEFAULTS).selected
    ).toBe('diver');
    expect(
      restoreSaved({ progress: unlocked, selected: 'cuckoo' }, DEFAULTS)
        .selected
    ).toBe('diver');
  });
});

describe('restoreSaved: timing records', () => {
  const record = {
    count: 2,
    sum: 3,
    sumSquares: 5,
    perfects: 1,
    recent: [1, 2],
  };

  it('keeps each valid record, for watches a newer version added too', () => {
    expect(
      restoreSaved(
        {
          timing: {
            diver: record,
            worldtimer: record,
            gmt: { ...record, count: -1 },
            'Not An Id': record,
          },
        },
        DEFAULTS
      ).timing
    ).toEqual({ diver: record, worldtimer: record });
  });

  it.each([undefined, null, 42, [record]])(
    'starts with no records from %j',
    timing => {
      expect(restoreSaved({ timing }, DEFAULTS).timing).toEqual({});
    }
  );
});

describe('restoreSaved: variants', () => {
  const restore = (variants: unknown) =>
    restoreSaved({ variants }, DEFAULTS).variants;

  it('loads a save from before variants existed', () => {
    expect(restoreSaved({ selected: 'diver' }, DEFAULTS).variants).toEqual({});
  });

  it.each([null, 'blue', ['blue'], 42])('drops unusable picks %j', saved => {
    expect(restore(saved)).toEqual({});
  });

  it('keeps well-formed picks, earned or not, of watches known or not', () => {
    expect(
      restore({
        diver: 'blue',
        gmt: 'burgundyBlack',
        worldtimer: 'ocean',
        moonphase: 7,
        tourbillon: 'Not An Id',
        'Not An Id': 'blue',
      })
    ).toEqual({ diver: 'blue', gmt: 'burgundyBlack', worldtimer: 'ocean' });
  });

  it('moves a pick of a replaced variant to the one that took its place', () => {
    expect(
      restore({
        diver: 'greenBezel',
        chronograph: 'tropical',
        gmt: 'brownBlack',
        tourbillon: 'crimson',
        grandComplication: 'blue',
      })
    ).toEqual({
      diver: 'green',
      chronograph: 'cream',
      gmt: 'burgundyBlack',
      tourbillon: 'orangeBlack',
      grandComplication: 'navy',
    });
    expect(restore({ tourbillon: 'lime' })).toEqual({ tourbillon: 'yellow' });
  });

  it('moves a retired id only on the watch it was retired from', () => {
    // Blue left the Tourbillon and the Grand Complication, not the Diver.
    expect(
      restore({ diver: 'blue', tourbillon: 'blue', grandComplication: 'blue' })
    ).toEqual({
      diver: 'blue',
      tourbillon: 'orangeBlack',
      grandComplication: 'navy',
    });
  });
});

describe('restoreSaved: the Daily and the power reserve', () => {
  const daily = { number: 2, best: 23, marks: 'PGGP' };
  const restore = (state: unknown) => restoreSaved(state, DEFAULTS);

  it('loads a save from before the Daily existed', () => {
    const restored = restore({ progress: { best: { diver: 9 } } });
    expect(restored.daily).toBeNull();
    expect(restored.reserve).toEqual(UNWOUND);
    expect(restored.progress.best).toEqual({ diver: 9 });
  });

  it.each([
    null,
    'daily',
    { ...daily, number: 0 },
    { ...daily, number: 2.5 },
    { ...daily, number: '2' },
    { ...daily, best: -1 },
    { ...daily, best: undefined },
    { ...daily, marks: 'PGX' },
    { ...daily, marks: 'P'.repeat(1001) },
    { ...daily, marks: 7 },
  ])('drops the unusable Daily record %j', saved => {
    expect(restore({ daily: saved }).daily).toBeNull();
  });

  it('keeps a Daily record with no hits', () => {
    expect(restore({ daily: { number: 5, best: 0, marks: '' } }).daily).toEqual(
      { number: 5, best: 0, marks: '' }
    );
  });

  it.each([
    null,
    [],
    { days: 8, woundOn: 3 },
    { days: -1, woundOn: 3 },
    { days: 1.5, woundOn: 3 },
    { days: 3, woundOn: -2 },
    { days: 3, woundOn: 1.5 },
    { days: 3 },
    { woundOn: 3 },
  ])('falls back to an unwound reserve for %j', saved => {
    expect(restore({ reserve: saved }).reserve).toEqual(UNWOUND);
  });

  it('keeps a full reserve, and one never wound', () => {
    expect(restore({ reserve: { days: 7, woundOn: 30 } }).reserve).toEqual({
      days: 7,
      woundOn: 30,
    });
    expect(restore({ reserve: { days: 0, woundOn: 0 } }).reserve).toEqual(
      UNWOUND
    );
  });

  it('drops a Daily or a wind too far ahead of today, and keeps one near it', () => {
    const ahead = (days: number) =>
      restoreSaved(
        {
          daily: { ...daily, number: 10 + days },
          reserve: { days: 3, woundOn: 10 + days },
        },
        DEFAULTS,
        10
      );
    expect(ahead(DAYS_AHEAD).daily?.number).toBe(10 + DAYS_AHEAD);
    expect(ahead(DAYS_AHEAD).reserve.woundOn).toBe(10 + DAYS_AHEAD);
    expect(ahead(DAYS_AHEAD + 1).daily).toBeNull();
    expect(ahead(DAYS_AHEAD + 1).reserve).toEqual(UNWOUND);
    // Not knowing today, it can't tell: everything well-formed is kept.
    expect(restore({ daily: { ...daily, number: 9999 } }).daily?.number).toBe(
      9999
    );
  });
});

describe('restoreSaved: tips', () => {
  const restore = (tips: unknown) => restoreSaved({ tips }, DEFAULTS).tips;

  it('loads a save from before tips existed with none seen', () => {
    expect(restoreSaved({ selected: 'diver' }, DEFAULTS).tips).toEqual([]);
  });

  it.each([null, 'perfect', { perfect: true }, 42])(
    'drops unusable tips %j',
    saved => {
      expect(restore(saved)).toEqual([]);
    }
  );

  it('keeps well-formed tips once each, ones a newer version added too', () => {
    expect(
      restore(['perfect', 'perfect', 'nightMarch', 'Not A Tip', 7, null, ''])
    ).toEqual(['perfect', 'nightMarch']);
  });

  it('keeps no more than a save could ever need', () => {
    const many = Array.from(
      { length: 100 },
      (_, index) => `tip${String(index)}`
    );
    expect(restore(many)).toHaveLength(32);
  });
});
