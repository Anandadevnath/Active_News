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

const timeOf = (i: NewsItem) => (i.publishedAt ? Date.parse(i.publishedAt) || 0 : 0);

/** Newest first; undated stories last, hottest first among equals. */
export function byTime(a: NewsItem, b: NewsItem): number {
  return timeOf(b) - timeOf(a) || byHeat(a, b);
}

// question and filler words: "why is rice price rising" searches for "rice price rising"
const STOP_WORDS = new Set(
  "a an the is are was were be been am do does did can could should would will may might i me my you your it its this that these those of to in on at by for from with about and or but what whats why how who which when where".split(" "),
);

/** The words that carry a query's meaning, lower-case, without punctuation or question words. */
export function keywords(query: string): string[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
  const kept = words.filter((w) => !STOP_WORDS.has(w));
  return kept.length > 0 ? kept : words;
}

// Generic words of how-to questions ("how to make X", "best free X"): kept when they match, dropped first when nothing does
const WEAK_WORDS = new Set(
  "make makes making made get gets getting got use using used create creating build building start starting find finding best good better top new easy easily free own way ways need want help learn learning guide tutorial tips step steps really actually just still even much many more most some any all there here then than so very too also like know think thing things people someone anyone something anything".split(" "),
);

/** Keywords in the order they are given up: topic words first (as typed), generic words last. */
export function dropOrder(kws: readonly string[]): string[] {
  return [...kws.filter((k) => !WEAK_WORDS.has(k)), ...kws.filter((k) => WEAK_WORDS.has(k))];
}

const escapeRegExp = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every keyword starts a word somewhere in the text, in any order ("price" also matches "prices"). */
function hasWordStarts(text: string, kws: readonly string[]): boolean {
  return kws.every((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(k)}`, "iu").test(text));
}

/** Names (1-2 keywords) must appear as a whole phrase; longer queries need every keyword. */
export function matchesQuery(text: string, query: string): boolean {
  const kws = keywords(query);
  return kws.length <= 2 ? containsPhrase(text, kws.join(" ")) : hasWordStarts(text, kws);
}

/** How many of the query's keywords start a word in the text: ranks search results, best match first. */
export function relevance(text: string, query: string): number {
  return keywords(query).filter((k) => hasWordStarts(text, [k])).length;
}

/**
 * Items matching the query. When none has every keyword, keywords are given up in dropOrder and it tries
 * again, down to two: "rice price rising" -> "rice price", "make anime website" -> "anime website" (not "make anime").
 */
export function filterByQuery<T>(items: readonly T[], text: (item: T) => string, query: string): T[] {
  const kws = keywords(query);
  if (kws.length <= 2) return items.filter((i) => containsPhrase(text(i), kws.join(" ")));
  const order = dropOrder(kws);
  for (let n = order.length; n >= 2; n -= 1) {
    const hits = items.filter((i) => hasWordStarts(text(i), order.slice(0, n)));
    if (hits.length > 0) return hits;
  }
  return [];
}

/** Merge lists keeping the first occurrence of each id. */
export function dedupe(items: readonly NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** The phrase appears as whole words, any spacing ("one piece" matches "One  Piece!" but not "one of the best pieces"). */
export function containsPhrase(text: string, phrase: string): boolean {
  const words = phrase.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length > 0 && new RegExp(`(^|\\W)${words.join("\\s+")}(\\W|$)`, "i").test(text);
}
