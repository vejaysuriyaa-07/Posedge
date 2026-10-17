import { describe, expect, it } from 'vitest';
import { citedRefs, hideIncompleteCitation, replaceCitations, stripCitations } from './citations';

describe('citations', () => {
  const text =
    'Finish the lab [[t3]] before the SVA milestone [[m1]]. The lab [[t3]] matters for [[p9]].';

  it('lists unique refs in order and filters unknown ones', () => {
    expect(citedRefs(text)).toEqual(['t3', 'm1', 'p9']);
    expect(citedRefs(text, (r) => r !== 'p9')).toEqual(['t3', 'm1']);
  });

  it('hides a citation that is still streaming in', () => {
    for (const tail of ['[', '[[', '[[t', '[[t1', '[[t12]']) {
      expect(hideIncompleteCitation(`Do the lab ${tail}`)).toBe('Do the lab ');
    }
    expect(hideIncompleteCitation('Do the lab [[t1]]')).toBe('Do the lab [[t1]]');
  });

  it('replaces or strips citations', () => {
    const nums = new Map([
      ['t3', 1],
      ['m1', 2],
    ]);
    expect(replaceCitations(text, (r) => (nums.has(r) ? `{${nums.get(r)}}` : null))).toBe(
      'Finish the lab {1} before the SVA milestone {2}. The lab {1} matters for.',
    );
    expect(stripCitations('Lab [[t3]] first.')).toBe('Lab first.');
  });
});
