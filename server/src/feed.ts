import type { NewsItem } from "./types.js";

/** Hottest first. Ties (each platform's #1 is 100) are broken by platform rank, so platforms interleave. */
export function byHeat(a: NewsItem, b: NewsItem): number {
  return b.heat - a.heat || a.rank - b.rank || a.platform.localeCompare(b.platform);
}

/** Deterministic 0..1 from (seed, id): FNV-1a hash, so one reader's pages stay consistent. */
export function seededRandom(seed: number, id: string): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const JITTER_FLOOR = 0.35; // a story keeps at least 35% of its heat when shuffled

/**
 * Per-visit order: heat scaled by a seeded random factor (rising stories always get a full share).
 * Hot stories still tend to lead, but every reload brings different ones up.
 */
export function shuffleByHeat(items: readonly NewsItem[], seed: number): NewsItem[] {
  const key = (i: NewsItem) => (i.rising ? i.heat : i.heat * (JITTER_FLOOR + (1 - JITTER_FLOOR) * seededRandom(seed, i.id)));
  return items
    .map((item) => ({ item, k: key(item) }))
    .sort((a, b) => b.k - a.k)
    .map(({ item }) => item);
}

/** One story from each list per round (hottest first within the round). */
export function interleave(lists: readonly (readonly NewsItem[])[]): NewsItem[] {
  const rounds = Math.max(0, ...lists.map((l) => l.length));
  return Array.from({ length: rounds }, (_, r) => lists.flatMap((l) => (l[r] ? [l[r]] : [])).sort(byHeat)).flat();
}

/** Every term must appear in the title, description or author (case-insensitive). */
export function matches(item: NewsItem, terms: readonly string[]): boolean {
  const haystack = `${item.title} ${item.description} ${item.author}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Merge lists keeping the first occurrence of each id. */
export function dedupe(items: readonly NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}
