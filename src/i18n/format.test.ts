import { describe, expect, it } from 'vitest';

import { listOf } from './format';
import { DICTIONARIES } from '.';

describe('listOf', () => {
  it('lists names the way each language does', () => {
    expect(listOf(DICTIONARIES.en, ['Tourbillon', 'Endless'])).toBe(
      'Tourbillon and Endless'
    );
    expect(listOf(DICTIONARIES.tr, ['Tourbillon', 'Endless'])).toBe(
      'Tourbillon ve Endless'
    );
    expect(listOf(DICTIONARIES.en, ['GMT'])).toBe('GMT');
  });
});
