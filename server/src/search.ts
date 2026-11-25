import { byHeat, dedupe, matches, searchTerms } from "./feed.js";
import { scoreItems } from "./heat.js";
import type { SourceDef } from "./sources/index.js";
import type { NewsStore } from "./store.js";
import type { Filter, NewsItem, Platform, SearchPage } from "./types.js";

const SEARCH_TIMEOUT_MS = 25_000;
const MAX_AGE_MS = 14 * 24 * 3_600_000; // "trending or active": drop older live results (undated ones stay)
const POOL_PAGE = 30;
const CACHE_TTL_MS = 2 * 60_000;
const CACHE_MAX = 100;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms).unref()),
  ]);
}

/**
 * Search = matching stories already collected (instant) + live search on each platform that has one.
 * Results are cached for two minutes per (query, filter, page) to avoid hammering the platforms.
 */
export class Searcher {
  private cache = new Map<string, { at: number; page: SearchPage }>();

  constructor(
    private readonly store: NewsStore,
    private readonly sources: Partial<Record<Platform, SourceDef>>,
    private readonly now: () => number = Date.now,
  ) {}

  private live(query: string, filter: Filter, page: number) {
    const platforms = (filter === "all" ? this.store.platforms() : [filter]).filter((p) => this.sources[p]?.search);
    return Promise.all(
      platforms.map(async (platform) => {
        try {
          const raw = await withTimeout(this.sources[platform]!.search!(query, page), SEARCH_TIMEOUT_MS);
          const recent = raw.filter((i) => !i.publishedAt || this.now() - Date.parse(i.publishedAt) <= MAX_AGE_MS);
          return { platform, items: scoreItems(recent, new Map(), this.now()), error: null };
        } catch (err) {
          return { platform, items: [] as NewsItem[], error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  async search(query: string, filter: Filter, page: number): Promise<SearchPage> {
    const key = `${filter}\u0000${page}\u0000${query.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.page;

    const terms = searchTerms(query);
    const pool = this.store.items(filter).filter((i) => matches(i, terms));
    const poolSlice = pool.slice(page * POOL_PAGE, (page + 1) * POOL_PAGE);
    const live = await this.live(query, filter, page);
    const liveItems = live.flatMap((r) => r.items);

    const result: SearchPage = {
      items: dedupe([...poolSlice, ...liveItems.sort(byHeat)]),
      hasMore: pool.length > (page + 1) * POOL_PAGE || liveItems.length > 0,
      errors: live.filter((r) => r.error).map((r) => ({ platform: r.platform, error: r.error! })),
    };
    this.cache.set(key, { at: this.now(), page: result });
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
