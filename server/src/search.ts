import { byHeat, byTime, dedupe, filterByQuery, relevance } from "./feed.js";
import { scoreItems } from "./heat.js";
import type { SourceDef } from "./sources/index.js";
import type { NewsStore } from "./store.js";
import type { Filter, NewsItem, Platform, SearchPage, Sort } from "./types.js";

const SEARCH_TIMEOUT_MS = 25_000; // 4chan reads up to 10 boards 1.1s apart (~11s) when its cache is cold
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

  private live(query: string, filter: Filter, page: number, sort: Sort) {
    const platforms = (filter === "all" ? this.store.platforms() : [filter]).filter((p) => this.sources[p]?.search);
    return Promise.all(
      platforms.map(async (platform) => {
        try {
          const raw = await withTimeout(this.sources[platform]!.search!(query, page, sort), SEARCH_TIMEOUT_MS);
          // no age cut: like each platform's own search; heat still ranks recent, active posts first
          return { platform, items: scoreItems(raw, new Map(), this.now()), error: null };
        } catch (err) {
          return { platform, items: [] as NewsItem[], error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  /** hot: best match first (most keywords in the title), then by heat. latest: everything newest first. */
  async search(query: string, filter: Filter, page: number, sort: Sort = "hot"): Promise<SearchPage> {
    const key = `${filter}\u0000${sort}\u0000${page}\u0000${query.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.page;

    const pool = filterByQuery(this.store.items(filter, undefined, sort), (i) => `${i.title} ${i.description} ${i.author}`, query);
    const poolSlice = pool.slice(page * POOL_PAGE, (page + 1) * POOL_PAGE);
    const live = await this.live(query, filter, page, sort);
    const liveItems = live.flatMap((r) => r.items);

    const items = dedupe([...poolSlice, ...liveItems]);
    // titles only: long 4chan threads and posts contain a query's words scattered through unrelated text
    const score = new Map(items.map((i) => [i.id, relevance(i.title, query)]));
    const result: SearchPage = {
      items: sort === "latest" ? items.sort(byTime) : items.sort((a, b) => score.get(b.id)! - score.get(a.id)! || byHeat(a, b)),
      hasMore: pool.length > (page + 1) * POOL_PAGE || liveItems.length > 0,
      errors: live.filter((r) => r.error).map((r) => ({ platform: r.platform, error: r.error! })),
    };
    this.cache.set(key, { at: this.now(), page: result });
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
