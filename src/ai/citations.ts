/**
 * Inline citations in EDGE's answers: `[[t3]]`, `[[p1]]`, `[[m2]]` refer to snapshot items
 * (see `withShortRefs`). Pure string helpers; the view turns them into numbered source chips.
 */
const CITE_RE = /\[\[([pmt]\d+)\]\]/g;

/** Unique refs in order of first appearance, keeping only those `known` accepts. */
export function citedRefs(text: string, known: (ref: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITE_RE)) {
    const ref = m[1]!;
    if (known(ref) && !out.includes(ref)) out.push(ref);
  }
  return out;
}

/** Drops a citation that is still streaming in at the end of the text ("…lab [[t1"). */
export function hideIncompleteCitation(text: string): string {
  return text.replace(/\[(\[([pmt]\d*\]?)?)?$/, '');
}

/** Replaces each citation with `render(ref)`; refs that render to null are removed. */
export function replaceCitations(text: string, render: (ref: string) => string | null): string {
  return text.replace(/\s?\[\[([pmt]\d+)\]\]/g, (whole, ref: string) => {
    const r = render(ref);
    return r === null ? '' : `${whole.startsWith(' ') ? ' ' : ''}${r}`;
  });
}

export function stripCitations(text: string): string {
  return replaceCitations(text, () => null);
}
