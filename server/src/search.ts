import { byHeat, dedupe, filterByQuery, relevance } from "./feed.js";
import { scoreItems } from "./heat.js";
import { LatestMerge, type StreamKey, type StreamRead } from "./latest.js";
import type { SourceDef } from "./sources/index.js";
import type { NewsStore } from "./store.js";
import type { Filter, NewsItem, Platform, SearchPage, Sort } from "./types.js";

const SEARCH_TIMEOUT_MS = 25_000; // 4chan reads up to 10 boards 1.1s apart (~11s) when its cache is cold
const POOL_PAGE = 30;
const CACHE_TTL_MS = 2 * 60_000;
const CACHE_MAX = 100;
const LATEST_TTL_MS = 10 * 60_000; // a Latest search keeps its place while the reader scrolls
const LATEST_MAX = 50;
const QUICK_MS = 1_500; // a `fast` request answers by then with what the quick platforms found

interface LiveResult {
  platform: Platform;
  items: NewsItem[];
  error: string | null;
}

/** A page being built: `full` once every platform answered; `preview` is what has arrived so far. */
interface PageRun {
  full: Promise<SearchPage>;
  preview: () => SearchPage;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms).unref()),
  ]);
}

/**
 * Search = matching stories already collected (instant) + live search on each platform that has one.
 * Hot results are cached for two minutes per (query, filter, page) to avoid hammering the platforms;
 * Latest keeps one newest-first merge per (query, filter) while the reader scrolls.
 * The page after the one served is built in the background, so scrolling rarely waits.
 */
export class Searcher {
  private cache = new Map<string, { at: number; run: PageRun }>();
  private latestRuns = new Map<string, { created: number; at: number; merge: LatestMerge }>();

  constructor(
    private readonly store: NewsStore,
    private readonly sources: Partial<Record<Platform, SourceDef>>,
    private readonly now: () => number = Date.now,
  ) {}

  private searchable(filter: Filter): Platform[] {
    return (filter === "all" ? this.store.platforms() : [filter]).filter((p) => this.sources[p]?.search);
  }

  private poolMatches(query: string, filter: Filter, sort: Sort): readonly NewsItem[] {
    return filterByQuery(this.store.items(filter, undefined, sort), (i) => `${i.title} ${i.description} ${i.author}`, query);
  }

  /** One platform's live results, scored. No age cut: like each platform's own search; heat ranks recent, active posts first. */
  private async searchPlatform(platform: Platform, query: string, page: number, sort: Sort): Promise<NewsItem[]> {
    const raw = await withTimeout(this.sources[platform]!.search!(query, page, sort), SEARCH_TIMEOUT_MS);
    return scoreItems(raw, new Map(), this.now());
  }

  /**
   * hot: best match first (most keywords in the title), then by heat. latest: newest first across every page.
   * `fast`: if the page is not ready within QUICK_MS, answer with what has arrived (`partial`, the platforms still
   * searching in `pending`); the page keeps building, so asking again returns it.
   */
  async search(query: string, filter: Filter, page: number, sort: Sort = "hot", fast = false): Promise<SearchPage> {
    const run = this.run(query, filter, page, sort);
    if (fast) {
      const quick = await Promise.race([run.full, new Promise<null>((r) => setTimeout(() => r(null), QUICK_MS).unref())]);
      const preview = quick ?? run.preview();
      if (quick || preview.items.length > 0) return quick ? this.served(quick, query, filter, page, sort) : preview;
    }
    return this.served(await run.full, query, filter, page, sort);
  }

  private served(result: SearchPage, query: string, filter: Filter, page: number, sort: Sort): SearchPage {
    if (result.hasMore) void this.run(query, filter, page + 1, sort).full.catch(() => undefined); // next page, ready when the reader scrolls
    return result;
  }

  private run(query: string, filter: Filter, page: number, sort: Sort): PageRun {
    return sort === "latest" ? this.latest(query, filter, page) : this.hot(query, filter, page);
  }

  private hot(query: string, filter: Filter, page: number): PageRun {
    const key = `${filter}\u0000${page}\u0000${query.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.run;

    const pool = this.poolMatches(query, filter, "hot");
    const platforms = this.searchable(filter);
    const arrived: LiveResult[] = [];
    const build = (): SearchPage => {
      const poolSlice = pool.slice(page * POOL_PAGE, (page + 1) * POOL_PAGE);
      const liveItems = arrived.flatMap((r) => r.items);
      const items = dedupe([...poolSlice, ...liveItems]);
      // titles only: long 4chan threads and posts contain a query's words scattered through unrelated text
      const score = new Map(items.map((i) => [i.id, relevance(i.title, query)]));
      return {
        items: items.sort((a, b) => score.get(b.id)! - score.get(a.id)! || byHeat(a, b)),
        hasMore: pool.length > (page + 1) * POOL_PAGE || liveItems.length > 0,
        errors: arrived.filter((r) => r.error).map((r) => ({ platform: r.platform, error: r.error! })),
      };
    };
    const full = Promise.all(
      platforms.map(async (platform) => {
        let result: LiveResult;
        try {
          result = { platform, items: await this.searchPlatform(platform, query, page, "hot"), error: null };
        } catch (err) {
          result = { platform, items: [], error: err instanceof Error ? err.message : String(err) };
        }
        arrived.push(result);
      }),
    ).then(build);
    const run: PageRun = {
      full,
      preview: () => ({ ...build(), hasMore: true, partial: true, pending: platforms.filter((p) => !arrived.some((r) => r.platform === p)) }),
    };
    this.cache.set(key, { at: this.now(), run });
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return run;
  }

  private latest(query: string, filter: Filter, page: number): PageRun {
    const key = `${filter}\u0000${query.toLowerCase()}`;
    const run = this.latestRuns.get(key);
    // a new search (page 0) starts over after CACHE_TTL_MS; scrolling keeps its merge while the reader is active
    const stale = !run || this.now() - run.at >= LATEST_TTL_MS || (page === 0 && this.now() - run.created >= CACHE_TTL_MS);
    if (!stale) {
      this.latestRuns.set(key, { ...run, at: this.now() });
      return { full: run.merge.page(page), preview: () => run.merge.preview() };
    }
    const pool = this.poolMatches(query, filter, "latest");
    const reads: Partial<Record<StreamKey, StreamRead>> = {
      pool: async (p) => pool.slice(p * POOL_PAGE, (p + 1) * POOL_PAGE),
      ...Object.fromEntries(this.searchable(filter).map((platform) => [platform, (p: number) => this.searchPlatform(platform, query, p, "latest")])),
    };
    const merge = new LatestMerge(reads);
    this.latestRuns.delete(key);
    this.latestRuns.set(key, { created: this.now(), at: this.now(), merge });
    if (this.latestRuns.size > LATEST_MAX) this.latestRuns.delete(this.latestRuns.keys().next().value!);
    return { full: merge.page(page), preview: () => merge.preview() };
  }
}
