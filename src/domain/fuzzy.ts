/** Lowercase, strip accents, and drop everything that is not a-z or 0-9. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    out.set(bg, (out.get(bg) ?? 0) + 1);
  }
  return out;
}

/**
 * Similarity in 0..1 between two names, compared after normalizeName.
 * Equal names score 1. If one contains the other (and the shorter has at least 3 characters) the
 * score is at least 0.85, rising with the length ratio. Otherwise it is the Sørensen–Dice
 * coefficient over character bigrams.
 */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.includes(short)) {
    return 0.85 + 0.15 * (short.length / long.length);
  }
  const bx = bigrams(x);
  const by = bigrams(y);
  let total = 0;
  for (const n of bx.values()) total += n;
  for (const n of by.values()) total += n;
  if (total === 0) return 0;
  let overlap = 0;
  for (const [bg, n] of bx) overlap += Math.min(n, by.get(bg) ?? 0);
  return (2 * overlap) / total;
}

/** Highest-scoring item at or above `threshold`; ties keep the first item. */
export function bestMatch<T extends { name: string }>(
  query: string,
  items: T[],
  threshold = 0.6,
): { item: T; score: number } | undefined {
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    const score = similarity(query, item.name);
    if (score >= threshold && (!best || score > best.score)) best = { item, score };
  }
  return best;
}
