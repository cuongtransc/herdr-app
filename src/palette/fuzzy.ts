/**
 * How well a query matches a piece of text, for the ⌘K palette. Tiers in the manner of
 * match-sorter (exact > prefix > word start > substring), and for scattered letters an
 * fzf-style score: consecutive letters and letters at word starts count most, gaps cost.
 * 0 means no match. Both arguments are expected lower-cased.
 */
const BOUNDARY = /[\s\-_./:\\›@]/;

export const TIER = { exact: 1000, prefix: 900, word: 800, substring: 700, fuzzy: 600 } as const;

const atWordStart = (t: string, i: number) => i === 0 || BOUNDARY.test(t[i - 1]);

/** Scattered letters: the shortest window holding `q` in order, scored fzf-style (≤ TIER.fuzzy). */
function fuzzy(t: string, q: string): number {
  // Forward pass: where the first full match ends.
  let qi = 0;
  let end = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi] && ++qi === q.length) end = i;
  if (end < 0) return 0;
  // Backward pass from there: the latest start, so the window is as short as can be.
  qi = q.length - 1;
  let start = end;
  for (let i = end; i >= 0 && qi >= 0; i--) if (t[i] === q[qi] && --qi < 0) start = i;
  // Score the letters inside that window with fzf's constants: 16 a letter, +10 at a word start
  // (+4 when it continues a run instead), the query's first letter's bonus doubled, and a gap
  // costing 3 to open and 1 for each further letter skipped.
  let score = 0;
  let prev = -1;
  qi = 0;
  for (let i = start; i <= end && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    let bonus = atWordStart(t, i) ? 10 : prev === i - 1 ? 4 : 0;
    if (qi === 0) bonus *= 2;
    const gap = prev >= 0 ? i - prev - 1 : 0;
    score += 16 + bonus - (gap > 0 ? Math.min(12, 2 + gap) : 0);
    prev = i;
    qi++;
  }
  const best = 16 + 20 + (q.length - 1) * 26;
  return Math.max(1, Math.round(Math.min(1, score / best) * TIER.fuzzy));
}

export function scoreText(text: string, q: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  if (!t) return 0;
  // Within a tier, a tighter fit (less text around the match) scores a little higher.
  const slack = Math.min(50, t.length - q.length);
  if (t === q) return TIER.exact;
  if (t.startsWith(q)) return TIER.prefix - slack;
  let i = t.indexOf(q);
  if (i >= 0) {
    for (; i >= 0; i = t.indexOf(q, i + 1)) if (atWordStart(t, i)) return TIER.word - slack;
    return TIER.substring - slack;
  }
  return fuzzy(t, q);
}

/** A field to search and how much a match in it counts. */
export interface Field {
  text: string;
  weight: number;
}

/** Every whitespace-separated word of `query` must match some field; the score adds up each word's best field. 0 = no match. */
export function scoreFields(fields: Field[], query: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let total = 0;
  for (const w of words) {
    let best = 0;
    for (const f of fields) best = Math.max(best, scoreText(f.text, w) * f.weight);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}
