import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from './random';

describe('seeded random', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(hashString('task-1'));
    const b = mulberry32(hashString('task-1'));
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(hashString('task-1')).not.toBe(hashString('task-2'));
  });
});
