import { describe, expect, it } from 'vitest';

import type { CloudSave } from './app-store';
import { backupFile, readBackup } from './backup';
import { UNWOUND } from './reserve';

const SAVE: CloudSave = {
  progress: {
    best: { diver: 20 },
    unlocked: ['diver', 'chronograph'],
    points: 180,
  },
  variants: { diver: 'green' },
  daily: { number: 3, best: 9, marks: 'PG' },
  dailies: { '2': 14, '3': 9 },
  reserve: UNWOUND,
  timing: {},
  engravings: { escapement: 3 },
};

describe('backupFile', () => {
  it('names the file for the local day', () => {
    expect(backupFile(SAVE, new Date(2026, 9, 3, 23, 59)).name).toBe(
      'tick-perfect-2026-10-03.json'
    );
    expect(backupFile(SAVE, new Date(2027, 0, 9, 0, 1)).name).toBe(
      'tick-perfect-2027-01-09.json'
    );
  });

  it('holds everything earned, marked as a backup', () => {
    const now = new Date(Date.UTC(2026, 9, 3, 12));
    expect(JSON.parse(backupFile(SAVE, now).text)).toEqual({
      app: 'tick-perfect',
      version: 1,
      savedAt: '2026-10-03T12:00:00.000Z',
      ...SAVE,
    });
  });
});

describe('readBackup', () => {
  it('reads back a backup it wrote', () => {
    const { text } = backupFile(SAVE, new Date(2026, 9, 3));
    const reading = readBackup(text);
    expect(reading.ok).toBe(true);
    expect(reading.ok && reading.saved).toMatchObject(SAVE);
  });

  it('reads a newer version’s backup, for what it understands', () => {
    expect(
      readBackup(JSON.stringify({ app: 'tick-perfect', version: 9, x: 1 }))
    ).toEqual({
      ok: true,
      saved: { app: 'tick-perfect', version: 9, x: 1 },
    });
  });

  it('says when a file can’t be read', () => {
    for (const text of ['', '{"app": "tick-perfect"', '\u0000\u0001']) {
      expect(readBackup(text)).toEqual({ ok: false, error: 'unreadable' });
    }
  });

  it('turns away anything that isn’t one of its backups', () => {
    for (const value of [
      null,
      42,
      'tick-perfect',
      ['tick-perfect'],
      { progress: SAVE.progress },
      { app: 'another-game', ...SAVE },
    ]) {
      expect(readBackup(JSON.stringify(value))).toEqual({
        ok: false,
        error: 'foreign',
      });
    }
  });
});
