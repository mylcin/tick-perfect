import { describe, expect, it, vi } from 'vitest';

import { en } from '../i18n/en';
import { cardContent } from '../screens/card-content';
import {
  CARD_SIZE,
  drawCard,
  shareCard,
  type CardContent,
  type CardPalette,
} from './result-card';

const PALETTE: CardPalette = {
  pool: '#fbfaf7',
  edge: '#e2ded6',
  ink: '#1b1a18',
  ink2: '#3b3834',
  ink3: '#5f5a53',
  ink4: '#8a847b',
  accent: '#7c5212',
};

/** A 2D context that only records what is written and drawn. */
function recorder() {
  const texts: string[] = [];
  const images: unknown[] = [];
  let filled = 0;
  let stroked = 0;
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillRect: () => undefined,
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string) => {
      texts.push(text);
    },
    drawImage: (image: unknown) => {
      images.push(image);
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => {
      filled += 1;
    },
    stroke: () => {
      stroked += 1;
    },
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    texts,
    images,
    marks: () => ({ filled, stroked }),
  };
}

const CONTENT: CardContent = {
  heading: 'Diver',
  score: 23,
  scoreLabel: 'Score',
  second: { label: 'Best', value: 31 },
  badges: ['New best'],
  qualities: ['perfect', 'good', 'perfect'],
  images: ['/watches/card/diver.webp'],
};

describe('drawCard', () => {
  it('draws the heading, the score, its chips, the trace and the address', () => {
    const { context, texts, images, marks } = recorder();
    drawCard(
      context,
      CONTENT,
      PALETTE,
      'watch' as unknown as CanvasImageSource
    );
    const written = texts.join('');
    expect(written).toContain('TICK PERFECT');
    expect(texts).toContain('Diver');
    expect(texts).toContain('23');
    expect(texts).toContain('31');
    expect(written).toContain('NEW BEST');
    expect(texts).toContain('tick-perfect.vercel.app');
    expect(images).toEqual(['watch']);
    expect(marks()).toEqual({ filled: 2, stroked: 1 });
    expect(CARD_SIZE).toBe(1080);
  });

  it('counts what the trace has no room for, and goes without a picture', () => {
    const { context, texts, images, marks } = recorder();
    drawCard(
      context,
      {
        ...CONTENT,
        second: null,
        badges: [],
        qualities: Array<'good'>(42).fill('good'),
      },
      PALETTE,
      null
    );
    expect(texts).toContain('+12');
    expect(texts).not.toContain('31');
    expect(images).toEqual([]);
    expect(marks().stroked).toBe(30);
  });
});

describe('shareCard', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  it('hands the card and the text to the share sheet where files go', async () => {
    const share = vi.fn(() => Promise.resolve());
    expect(
      await shareCard(blob, 'card.png', 'text', {
        canShare: () => true,
        share,
      })
    ).toBe('shared');
    expect(share).toHaveBeenCalledWith({
      files: [expect.any(File)],
      text: 'text',
    });
  });

  it('says so when the sheet is closed', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    expect(
      await shareCard(blob, 'card.png', 'text', {
        canShare: () => true,
        share: () => Promise.reject(abort),
      })
    ).toBe('cancelled');
  });
});

describe('cardContent', () => {
  const base = {
    t: en,
    watchName: 'Diver',
    images: ['/watches/card/diver.webp'],
    score: 23,
    qualities: ['perfect', 'good'] as const,
    daily: null,
  };

  it('shows a collection round with its best and what it earned', () => {
    expect(
      cardContent({
        ...base,
        outcome: {
          kind: 'collection',
          score: 23,
          best: 23,
          isNewBest: true,
          unlocked: [],
          certificate: 'adjusted',
          points: 400,
          levelUp: null,
          goal: null,
          variants: [],
        },
      })
    ).toMatchObject({
      heading: 'Diver',
      score: 23,
      second: { label: 'Best', value: 23 },
      badges: ['New best', 'Adjusted'],
    });
  });

  it('shows a Daily’s best run of the day, as its share text does', () => {
    const content = cardContent({
      ...base,
      daily: { number: 4, best: 30, marks: 'PPG' },
      outcome: {
        kind: 'daily',
        number: 4,
        daily: {
          counted: true,
          best: 30,
          isNewBest: false,
          reserve: 1,
          wound: false,
        },
        beat: { toBeat: 20, beaten: true, short: 0 },
      },
    });
    expect(content).toMatchObject({
      heading: 'Daily #4 · Diver',
      score: 30,
      second: null,
      badges: ['20 beaten'],
      qualities: ['perfect', 'perfect', 'good'],
    });
  });

  it('shows a race and a challenge against the score to beat', () => {
    const beat = { toBeat: 30, beaten: false, short: 8 };
    expect(
      cardContent({ ...base, outcome: { kind: 'ghost', beat } })
    ).toMatchObject({
      heading: 'Against your best · Diver',
      second: { label: 'To beat', value: 30 },
      badges: [],
    });
    expect(
      cardContent({ ...base, outcome: { kind: 'challenge', beat } }).heading
    ).toBe('Challenge · Diver');
  });
});
