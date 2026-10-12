import { describe, expect, it } from 'vitest';

import {
  announce,
  announcementHost,
  announcements,
  hostAnnouncements,
} from './announcer';

describe('announce', () => {
  it('numbers and times each announcement', () => {
    announce('Game paused');
    const first = announcements.get();
    announce('Game paused', true);
    const second = announcements.get();
    expect(first).toMatchObject({ text: 'Game paused', urgent: false });
    expect(second).toMatchObject({ text: 'Game paused', urgent: true });
    expect(second?.id).toBe((first?.id ?? 0) + 1);
    expect(second?.at).toBeGreaterThanOrEqual(first?.at ?? Infinity);
  });
});

describe('hostAnnouncements', () => {
  it('moves the live regions into the top open dialog, and back', () => {
    const seen: (HTMLElement | null)[] = [];
    const stop = announcementHost.subscribe(host => seen.push(host));
    const settings = {} as HTMLElement;
    const results = {} as HTMLElement;

    expect(announcementHost.get()).toBeNull();
    const closeSettings = hostAnnouncements(settings);
    const closeResults = hostAnnouncements(results);
    expect(announcementHost.get()).toBe(results);
    closeResults();
    expect(announcementHost.get()).toBe(settings);
    closeSettings();
    expect(announcementHost.get()).toBeNull();
    expect(seen).toEqual([settings, results, settings, null]);
    stop();
  });
});
