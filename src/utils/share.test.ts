import { describe, expect, it, vi } from 'vitest';

import type { HitQuality } from '../game';
import {
  APP_URL,
  MAX_TRACE_MARKS,
  shareResult,
  shareText,
  shareTrace,
} from './share';

const LINK = `${APP_URL}/?c=diver.z.23`;

/** `P` for a Perfect, `G` for a plain hit. */
const run = (marks: string): HitQuality[] =>
  marks.split('').map(mark => (mark === 'P' ? 'perfect' : 'good'));

describe('shareTrace', () => {
  it('draws a mark per hit, a filled diamond for a Perfect', () => {
    expect(shareTrace(run('PPGP'))).toBe('◆◆◇◆');
  });

  it('is empty for a run without a hit', () => {
    expect(shareTrace([])).toBe('');
  });

  it('wraps every ten marks', () => {
    expect(shareTrace(run('PPPPPPPPPPGG'))).toBe('◆◆◆◆◆◆◆◆◆◆\n◇◇');
    expect(shareTrace(run('GGGGGGGGGG'))).toBe('◇◇◇◇◇◇◇◇◇◇');
  });

  it('stops a long run at fifty marks and counts the rest', () => {
    const trace = shareTrace(run('P'.repeat(MAX_TRACE_MARKS + 7)));
    const lines = trace.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.at(-1)).toBe(`${'◆'.repeat(10)} +7`);
    expect(shareTrace(run('G'.repeat(MAX_TRACE_MARKS)))).not.toContain('+');
  });
});

describe('shareText', () => {
  it('names a Daily by its number, then the trace and the link', () => {
    expect(
      shareText({
        heading: { kind: 'daily', number: 42 },
        score: 23,
        qualities: run('PPGP'),
        link: LINK,
      })
    ).toBe(`Tick Perfect #42 · 23\n◆◆◇◆\n${LINK}`);
  });

  it('names any other round by its watch', () => {
    expect(
      shareText({
        heading: { kind: 'watch', watch: 'Diver' },
        score: 23,
        qualities: run('G'),
        link: LINK,
      })
    ).toBe(`Tick Perfect · Diver · 23\n◇\n${LINK}`);
  });

  it('leaves the trace out of a run without a hit', () => {
    expect(
      shareText({
        heading: { kind: 'watch', watch: 'GMT' },
        score: 0,
        qualities: [],
        link: LINK,
      })
    ).toBe(`Tick Perfect · GMT · 0\n${LINK}`);
  });
});

describe('shareResult', () => {
  const clipboard = (writeText = vi.fn(() => Promise.resolve())) =>
    ({ writeText }) as unknown as Clipboard;

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    await expect(
      shareResult('hi', { share, clipboard: clipboard(writeText) })
    ).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does nothing more when the player closes the sheet', async () => {
    const share = vi.fn(() =>
      Promise.reject(new DOMException('Cancelled', 'AbortError'))
    );
    await expect(
      shareResult('hi', { share, clipboard: clipboard() })
    ).resolves.toBe('cancelled');
  });

  it('copies when sharing is not available or not allowed', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    await expect(
      shareResult('hi', { clipboard: clipboard(writeText) })
    ).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');

    const blocked = vi.fn(() =>
      Promise.reject(new DOMException('No', 'NotAllowedError'))
    );
    await expect(
      shareResult('hi', { share: blocked, clipboard: clipboard() })
    ).resolves.toBe('copied');
  });

  it('reports a failure when even copying fails', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    await expect(
      shareResult('hi', { clipboard: clipboard(writeText) })
    ).resolves.toBe('failed');
  });
});
