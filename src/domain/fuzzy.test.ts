import { describe, expect, it } from 'vitest';
import { bestMatch, normalizeName, similarity } from './fuzzy';

describe('normalizeName', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeName('EE 577A: VLSI!')).toBe('ee577avlsi');
    expect(normalizeName('Café  Déjà-vu')).toBe('cafedejavu');
    expect(normalizeName('C++ / Python')).toBe('cpython');
  });
});

describe('similarity', () => {
  it('is 1 for names that normalize equal', () => {
    expect(similarity('DV Interview Prep', 'dv-interview prep')).toBe(1);
  });

  it('scores containment at least 0.85', () => {
    const s = similarity('Camera ISP', 'Camera ISP + Tiny Tapeout');
    expect(s).toBeGreaterThanOrEqual(0.85);
    expect(s).toBeLessThan(1);
    expect(similarity('ee577', 'EE 577A VLSI System Design')).toBeGreaterThanOrEqual(0.85);
  });

  it('does not treat very short containment as a match', () => {
    expect(similarity('ee', 'EE 577A VLSI System Design')).toBeLessThan(0.85);
  });

  it('uses bigram Dice otherwise', () => {
    expect(similarity('night', 'nacht')).toBeCloseTo(0.25, 5);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('is 0 for empty input', () => {
    expect(similarity('', 'anything')).toBe(0);
    expect(similarity('!!', '??')).toBe(0);
  });
});

describe('bestMatch', () => {
  const items = [
    { id: 'a', name: 'Camera ISP + Tiny Tapeout' },
    { id: 'b', name: 'DV Interview Prep' },
    { id: 'c', name: 'LeetCode' },
  ];

  it('returns the highest score above threshold', () => {
    expect(bestMatch('leetcode', items)?.item.id).toBe('c');
    expect(bestMatch('camera', items)?.item.id).toBe('a');
  });

  it('returns undefined below threshold', () => {
    expect(bestMatch('Desk Job', items)).toBeUndefined();
  });

  it('keeps the first item on ties', () => {
    const dupes = [
      { id: 'x', name: 'Same' },
      { id: 'y', name: 'same' },
    ];
    expect(bestMatch('SAME', dupes)?.item.id).toBe('x');
  });
});
