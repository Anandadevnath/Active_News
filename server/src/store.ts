import { EventEmitter } from "node:events";

import { byHeat, byTime, interleave, shuffleByHeat } from "./feed.js";
import { itemId, rememberEngagement, scoreItems, type Seen } from "./heat.js";
import type { SourceDef } from "./sources/index.js";
import type { FeedPage, Filter, NewsItem, Platform, RawItem, Sort, SourceStatus } from "./types.js";

const MAX_POOL = 20_000; // per platform; least recently seen stories are dropped first (deeper ones are re-fetched on demand)
const PREFETCH = 30; // load deeper pages when a reader gets this close to the end
const LOAD_MORE_TIMEOUT_MS = 30_000; // when the requested page cannot be filled yet
const FULL_PAGE_WAIT_MS = 3_000; // when it can: slow platforms finish in the background
const MAX_LOAD_ROUNDS = 3; // deeper pages per platform per feed request

interface Entry {
  raw: RawItem;
  rank: number; // position in the platform's order (page start + index)
  firstSeen: number;
  lastSeen: number;
}

/**
 * A growing pool of stories per platform. Timers refresh each platform's live first page;
 * readers scrolling near the end trigger deeper pages. Emits:
 *   "status" (SourceStatus)                      whenever a platform's state changes
 *   "new"    ({ platform, added: number })       when a refresh finds stories not seen before
 */
export class NewsStore extends EventEmitter {
  private pools = new Map<Platform, ReadonlyMap<string, Entry>>();
  private scored = new Map<Platform, readonly NewsItem[]>();
  private status = new Map<Platform, SourceStatus>();
  private cursors = new Map<Platform, string | null>(); // absent: no deep page fetched yet
  private engagement = new Map<Platform, Map<string, Seen>>();
  private loading = new Map<Platform, Promise<void>>();
  private combined: readonly NewsItem[] | null = null;
  private latest = new Map<Filter, readonly NewsItem[]>(); // newest-first lists, rebuilt after each rescore
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly sources: Partial<Record<Platform, SourceDef>>,
    private readonly now: () => number = Date.now,
  ) {
    super();
    for (const p of this.platforms()) {
      this.status.set(p, { platform: p, count: 0, error: null, updatedAt: null, refreshing: false, exhausted: false });
    }
  }

  platforms(): Platform[] {
    return Object.keys(this.sources) as Platform[];
  }

  statuses(): SourceStatus[] {
    return [...this.status.values()];
  }

  /**
   * Every collected story, scored. "all" takes one story from each platform per round (hottest
   * first within the round), so deep scrolling stays mixed instead of draining into the biggest pool.
   */
  items(filter: Filter = "all", seed?: number, sort: Sort = "hot"): readonly NewsItem[] {
    if (sort === "latest") return this.newest(filter);
    const ordered = (p: Platform) => {
      const list = this.scored.get(p) ?? [];
      return seed === undefined ? list : shuffleByHeat(list, seed);
    };
    if (filter !== "all") return ordered(filter);
    if (seed !== undefined) return interleave(this.platforms().map(ordered));
    this.combined ??= interleave(this.platforms().map(ordered));
    return this.combined;
  }

  /**
   * Every collected story newest first; undated stories go last, hottest first among them. "all" takes the
   * newest remaining story of each platform per round, so a platform with thousands of posts (4chan) cannot bury the rest.
   */
  private newest(filter: Filter): readonly NewsItem[] {
    const cached = this.latest.get(filter);
    if (cached) return cached;
    const sorted = (p: Platform) => [...(this.scored.get(p) ?? [])].sort(byTime);
    const list =
      filter === "all"
        ? (() => {
            const lists = this.platforms().map(sorted);
            const rounds = Math.max(0, ...lists.map((l) => l.length));
            return Array.from({ length: rounds }, (_, r) => lists.flatMap((l) => (l[r] ? [l[r]] : [])).sort(byTime)).flat();
          })()
        : sorted(filter);
    this.latest.set(filter, list);
    return list;
  }

  /** Platforms whose stories run out within the reader's next screenful and can still fetch more. */
  private needMore(filter: Filter, upTo: number, seed?: number, sort: Sort = "hot"): Platform[] {
    const window = this.items(filter, seed, sort).slice(0, upTo);
    const targets = filter === "all" ? this.platforms() : [filter];
    return targets.filter((p) => {
      if (!this.sources[p] || this.cursors.get(p) === null || this.status.get(p)?.error) return false;
      const total = this.scored.get(p)?.length ?? 0;
      const used = window.filter((i) => i.platform === p).length;
      return total === 0 || used + PREFETCH / 3 >= total;
    });
  }

  private setStatus(platform: Platform, patch: Partial<SourceStatus>): void {
    const next = { ...this.status.get(platform)!, ...patch };
    this.status.set(platform, next);
    this.emit("status", next);
  }

  private merge(platform: Platform, page: RawItem[], start: number, replace: boolean): number {
    const at = this.now();
    const current = this.pools.get(platform) ?? new Map<string, Entry>();
    const fresh = new Map(page.map((raw, i) => [itemId(raw), { raw, rank: start + i }]));
    const kept = replace ? [...current].filter(([id]) => fresh.has(id)) : [...current];
    const next = new Map(kept);
    let added = 0;
    for (const [id, { raw, rank }] of fresh) {
      const old = current.get(id);
      if (!old) added += 1;
      next.set(id, { raw, rank: old && start > 0 ? Math.min(old.rank, rank) : rank, firstSeen: old?.firstSeen ?? at, lastSeen: at });
    }
    const pruned = [...next].sort(([, a], [, b]) => b.lastSeen - a.lastSeen || a.rank - b.rank).slice(0, MAX_POOL);
    this.pools.set(platform, new Map(pruned));
    this.rescore(platform, at);
    return added;
  }

  private rescore(platform: Platform, at: number): void {
    const entries = [...(this.pools.get(platform)?.values() ?? [])].sort((a, b) => a.rank - b.rank);
    const items = scoreItems(entries.map((e) => e.raw), this.engagement.get(platform) ?? new Map(), at);
    this.engagement.set(platform, rememberEngagement(items, at));
    this.scored.set(platform, items.sort(byHeat));
    this.combined = null;
    this.latest.clear();
  }

  private async run(platform: Platform, task: () => Promise<void>): Promise<void> {
    const pending = this.loading.get(platform);
    if (pending) return pending; // one fetch per platform at a time
    const job = task().finally(() => this.loading.delete(platform));
    this.loading.set(platform, job);
    return job;
  }

  private fail(platform: Platform, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${platform}] ${message}`);
    this.setStatus(platform, { error: message, refreshing: false });
  }

  /** Re-fetch the platform's live first page and merge it in. */
  refresh(platform: Platform): Promise<void> {
    const def = this.sources[platform];
    if (!def) return Promise.resolve();
    return this.run(platform, async () => {
      this.setStatus(platform, { refreshing: true });
      try {
        const hadItems = (this.pools.get(platform)?.size ?? 0) > 0;
        const page = await def.fetch(null);
        const added = this.merge(platform, page.items, 0, def.replaceOnRefresh ?? false);
        if (!this.cursors.has(platform)) this.cursors.set(platform, page.next);
        this.setStatus(platform, {
          count: this.pools.get(platform)?.size ?? 0,
          error: null,
          updatedAt: new Date(this.now()).toISOString(),
          refreshing: false,
          exhausted: this.cursors.get(platform) === null,
        });
        if (hadItems && added > 0) this.emit("new", { platform, added });
      } catch (err) {
        this.fail(platform, err);
      }
    });
  }

  /** Fetch the next deeper page, if the platform has one. */
  loadMore(platform: Platform): Promise<void> {
    const def = this.sources[platform];
    if (!def) return Promise.resolve();
    if (!this.cursors.has(platform)) return this.refresh(platform);
    const cursor = this.cursors.get(platform);
    if (cursor === null || cursor === undefined) return Promise.resolve();
    return this.run(platform, async () => {
      try {
        const page = await def.fetch(cursor);
        this.merge(platform, page.items, this.pools.get(platform)?.size ?? 0, false);
        this.cursors.set(platform, page.next);
        this.setStatus(platform, { count: this.pools.get(platform)?.size ?? 0, exhausted: page.next === null });
      } catch (err) {
        this.fail(platform, err);
      }
    });
  }

  canGrow(filter: Filter): boolean {
    const targets = filter === "all" ? this.platforms() : [filter];
    return targets.some((p) => this.sources[p] && this.cursors.get(p) !== null && !this.status.get(p)?.error);
  }

  /**
   * A page of the feed; pulls deeper pages from the platforms when the reader nears the end.
   * Waits up to 30s when the requested page cannot be filled yet, else at most 3s.
   * `seed` (one per visit) shuffles stories of similar heat so each reload leads with different ones.
   */
  async feed(filter: Filter, offset: number, limit: number, seed?: number, sort: Sort = "hot"): Promise<FeedPage> {
    const deadline = this.now() + LOAD_MORE_TIMEOUT_MS;
    for (let round = 0; round < MAX_LOAD_ROUNDS; round += 1) {
      const targets = this.needMore(filter, offset + limit + PREFETCH, seed, sort);
      if (targets.length === 0) break;
      const before = this.items(filter).length;
      const loads = Promise.allSettled(targets.map((p) => this.loadMore(p)));
      // Page already full: wait briefly (keeps "all" mixed when sources are quick), then answer while loads finish.
      const until = before >= offset + limit ? Math.min(deadline, this.now() + FULL_PAGE_WAIT_MS) : deadline;
      const timeout = new Promise((r) => setTimeout(r, Math.max(0, until - this.now())).unref());
      await Promise.race([loads, timeout]);
      if (this.items(filter).length === before || this.now() >= until) break; // nothing new or out of time
    }
    const list = this.items(filter, seed, sort);
    return { items: list.slice(offset, offset + limit), hasMore: list.length > offset + limit || this.canGrow(filter), total: list.length };
  }

  start(): void {
    for (const platform of this.platforms()) {
      void this.refresh(platform);
      this.timers.push(setInterval(() => void this.refresh(platform), this.sources[platform]!.intervalMs));
    }
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
