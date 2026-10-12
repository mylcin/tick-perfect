import { describe, expect, it } from 'vitest';

import { DICTIONARIES, detectLanguage, isLanguage, LANGUAGES } from '.';

describe('detectLanguage', () => {
  it.each([
    [['tr-TR', 'en-US'], 'tr'],
    [['TR'], 'tr'],
    [['de-DE', 'tr'], 'tr'],
    [['en-GB'], 'en'],
    [['de-DE', 'fr'], 'en'],
    [[], 'en'],
  ])('picks %j → %s', (preferred, expected) => {
    expect(detectLanguage(preferred)).toBe(expected);
  });
});

describe('isLanguage', () => {
  it('accepts only supported codes', () => {
    expect(LANGUAGES.every(isLanguage)).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe('dictionaries', () => {
  /** Every leaf string, with message functions called on sample values. */
  function strings(value: unknown, path = ''): [string, string][] {
    if (typeof value === 'string') return [[path, value]];
    if (typeof value === 'function') {
      const message = (value as (...args: unknown[]) => unknown)(3, 5, true);
      return [[path, String(message)]];
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).flatMap(([key, child]) =>
        strings(child, path ? `${path}.${key}` : key)
      );
    }
    return [];
  }

  it.each(LANGUAGES)('has no empty strings in %s', language => {
    for (const [path, text] of strings(DICTIONARIES[language])) {
      expect(text.trim(), path).not.toBe('');
      expect(text, path).not.toContain('undefined');
    }
  });

  it('translates the same keys in every language', () => {
    const keys = (language: (typeof LANGUAGES)[number]) =>
      strings(DICTIONARIES[language]).map(([path]) => path);
    expect(keys('tr')).toEqual(keys('en'));
  });

  it('shows numbers in messages', () => {
    expect(DICTIONARIES.en.title.best(42)).toBe('Best 42');
    expect(DICTIONARIES.tr.title.best(42)).toBe('En iyi 42');
    expect(DICTIONARIES.tr.announce.gameOver(9, 9, true)).toContain(
      'Yeni rekor'
    );
  });

  it('says one hit and one variant in the singular', () => {
    const { en, tr } = DICTIONARIES;
    expect(en.timegrapher.trace(1, 4, 0)).toMatch(/^Trace of the last 1 hit: /);
    expect(en.timegrapher.trace(2, 4, 0)).toMatch(
      /^Trace of the last 2 hits: /
    );
    expect(en.variants.earned('Blue', 1)).toBe('New variant: Blue');
    expect(en.variants.earned('Green bezel and Blue', 2)).toBe(
      'New variants: Green bezel and Blue'
    );
    expect(tr.variants.earned('Mavi', 1)).toBe('Yeni renk seçeneği: Mavi');
    expect(tr.variants.earned('Yeşil bezel ve Mavi', 2)).toBe(
      'Yeni renk seçenekleri: Yeşil bezel ve Mavi'
    );
  });
});
