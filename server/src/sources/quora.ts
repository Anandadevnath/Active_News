import { config } from "../config.js";
import { keywords } from "../feed.js";
import type { Page, RawItem } from "../types.js";
import { runCli } from "./http.js";
import { exaSearch } from "./exa.js";
import { INTERESTS, rotation, stepOf, topicAt } from "./interests.js";
import { QueryPager } from "./pager.js";
import { runReach } from "./reach.js";

const TIMEOUT_MS = 120_000;
const FALLBACK_LIMIT = 15;

interface QuoraOutput {
  items?: { title: string; url: string }[];
  error?: string;
}

export function parseQuoraOutput(stdout: string): RawItem[] {
  const data = JSON.parse(stdout) as QuoraOutput;
  if (data.error) throw new Error(data.error);
  return (data.items ?? []).map((q) => ({
    platform: "quora" as const,
    title: q.title,
    url: q.url,
    author: "",
    description: "",
    publishedAt: null,
    discussionUrl: null,
    video: null,
    thumbnail: null,
    metrics: {},
  }));
}

/**
 * Quora questions found by web search, for when Quora blocks the Scrapling fetch:
 * your own Exa key when set, otherwise Agent Reach's shared (rate-limited) Exa search.
 */
export async function viaWebSearch(step = 1, query = `Quora question about ${topicAt(step)}`, limit = FALLBACK_LIMIT): Promise<RawItem[]> {
  const items = config.exaApiKey
    ? await exaSearch("quora", { query, domain: "quora.com", limit })
    : await runReach("quora", ["web", "search", `site:quora.com ${query}`, "--limit", String(limit)]);
  return items
    .filter((it) => new URL(it.url).hostname.endsWith("quora.com"))
    .map((it) => ({ ...it, title: it.title.replace(/\s+-\s+Quora$/, "") }));
}

const nextRefresh = rotation(INTERESTS.length, 1);

/**
 * First page: Scrapling (Python-only, so a small Python script) on Quora's World News topic; when Quora
 * blocks it, web search on the next interest in turn. Deeper pages: web search, one topic per page, never running out.
 */
export async function fetchQuora(cursor: string | null = null): Promise<Page> {
  if (cursor !== null) {
    const step = stepOf(cursor);
    return { items: await viaWebSearch(step), next: String(step + 1) };
  }
  try {
    return { items: parseQuoraOutput(await runCli(config.pythonBin, ["-I", config.quoraScript], TIMEOUT_MS)), next: "1" };
  } catch (direct) {
    try {
      return { items: await viaWebSearch(nextRefresh()[0]!), next: "2" };
    } catch (fallback) {
      throw new Error(`${(direct as Error).message}; Agent Reach: ${(fallback as Error).message}`);
    }
  }
}

/** One web search per page, each asking a different way, so Quora search reaches far past one query's ~100 results. */
export const SEARCH_VARIANTS = [
  (q: string) => `Quora discussion about ${q}`,
  (q: string) => `${q} questions on Quora`,
  (q: string) => `best answers about ${q}`,
  (q: string) => `why ${q}`,
  (q: string) => `how does ${q}`,
  (q: string) => `${q} vs`,
  (q: string) => `is ${q} worth it`,
  (q: string) => `${q} explained`,
  (q: string) => `${q} opinions`,
  (q: string) => q,
];
const SEARCH_LIMIT = 100; // Exa's maximum per request
const searchPager = new QueryPager<number>(); // cursor = next variant to try
const seenByQuery = new Map<string, Set<string>>(); // results earlier variants already returned

/**
 * Page n continues with the next variant that still finds new questions; empty once every variant is used.
 * Variants use the query's keywords ("why is X" would read "why why is X"); the last one is the query as typed.
 */
export function searchQuora(query: string, page: number): Promise<RawItem[]> {
  const key = query.toLowerCase();
  const term = keywords(query).join(" ");
  const last = SEARCH_VARIANTS.length - 1;
  if (page === 0 || !seenByQuery.has(key)) seenByQuery.set(key, new Set());
  if (seenByQuery.size > 100) seenByQuery.delete(seenByQuery.keys().next().value!);
  const seen = seenByQuery.get(key)!;
  return searchPager.page(query, page, async (start) => {
    for (let i = start ?? 0; i < SEARCH_VARIANTS.length; i += 1) {
      const fresh = (await viaWebSearch(0, SEARCH_VARIANTS[i]!(i === last ? query : term), SEARCH_LIMIT)).filter((it) => !seen.has(it.url) && Boolean(seen.add(it.url)));
      if (fresh.length > 0) return { items: fresh, next: i + 1 < SEARCH_VARIANTS.length ? i + 1 : null };
    }
    return { items: [], next: null };
  });
}
