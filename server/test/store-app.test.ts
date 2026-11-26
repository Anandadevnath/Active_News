import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { Searcher } from "../src/search.js";
import type { SourceDef } from "../src/sources/index.js";
import { NewsStore } from "../src/store.js";
import type { Page, Platform, RawItem } from "../src/types.js";

const item = (url: string, score = 1, platform: Platform = "hackernews", title = url): RawItem => ({
  platform,
  title,
  url,
  author: "",
  description: "",
  publishedAt: null,
  discussionUrl: null,
  video: null,
  thumbnail: null,
  metrics: { score },
});

/** A source with `pages` deep pages of `size` items each. */
function pagedSource(pages: number, size: number, platform: Platform = "hackernews"): SourceDef & { calls: (string | null)[] } {
  const calls: (string | null)[] = [];
  return {
    calls,
    intervalMs: 1000,
    fetch: async (cursor): Promise<Page> => {
      calls.push(cursor);
      const n = Number(cursor ?? 0);
      return {
        items: Array.from({ length: size }, (_, i) => item(`https://${platform}/${n}-${i}`, 100 - n * size - i, platform)),
        next: n + 1 < pages ? String(n + 1) : null,
      };
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NewsStore pool", () => {
  it("refresh merges new stories and reports how many were added", async () => {
    let batch = [item("https://a"), item("https://b")];
    const store = new NewsStore({ hackernews: { intervalMs: 1000, fetch: async () => ({ items: batch, next: null }) } });
    const added: number[] = [];
    store.on("new", ({ added: n }) => added.push(n));
    await store.refresh("hackernews");
    batch = [item("https://c"), item("https://a")];
    await store.refresh("hackernews");
    expect(store.items("hackernews").map((i) => i.url).sort()).toEqual(["https://a", "https://b", "https://c"]);
    expect(added).toEqual([1]); // first load is not "new"
  });

  it("replaceOnRefresh drops stories the platform no longer lists", async () => {
    let batch = [item("https://a"), item("https://b")];
    const store = new NewsStore({ "4chan": { intervalMs: 1000, replaceOnRefresh: true, fetch: async () => ({ items: batch, next: null }) } });
    await store.refresh("4chan");
    batch = [item("https://b")];
    await store.refresh("4chan");
    expect(store.items("4chan").map((i) => i.url)).toEqual(["https://b"]);
  });

  it("keeps the last good stories when a refresh fails", async () => {
    let fail = false;
    const store = new NewsStore({
      hackernews: { intervalMs: 1000, fetch: async () => { if (fail) throw new Error("down"); return { items: [item("https://a")], next: null }; } },
    });
    await store.refresh("hackernews");
    fail = true;
    await store.refresh("hackernews");
    expect(store.statuses()[0]).toMatchObject({ error: "down", count: 1, refreshing: false });
    expect(store.items()).toHaveLength(1);
  });

  it("feed pulls deeper pages as the reader scrolls, until the source is exhausted", async () => {
    const source = pagedSource(3, 20);
    const store = new NewsStore({ hackernews: source });
    const first = await store.feed("all", 0, 30);
    expect(first.items).toHaveLength(30);
    expect(first.hasMore).toBe(true);
    const second = await store.feed("all", 30, 30);
    expect(second.items).toHaveLength(30);
    expect(second.hasMore).toBe(false);
    expect(source.calls).toEqual([null, "1", "2"]);
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(60);
  });

  it("keeps deep scrolling mixed: a small platform pages in even when another has a big pool", async () => {
    const big = { intervalMs: 1000, fetch: async (): Promise<Page> => ({ items: Array.from({ length: 150 }, (_, i) => item(`https://4chan/${i}`, 1, "4chan")), next: null }) };
    const paged = pagedSource(10, 20, "youtube");
    const store = new NewsStore({ "4chan": big, youtube: paged });
    await store.refresh("4chan");
    await store.refresh("youtube");
    const deep = await store.feed("all", 90, 30);
    expect(deep.items.some((i) => i.platform === "youtube")).toBe(true);
    expect(paged.calls.length).toBeGreaterThan(1);
  });

  it("runs one fetch per platform at a time", async () => {
    const source = pagedSource(1, 5);
    const store = new NewsStore({ hackernews: source });
    await Promise.all([store.refresh("hackernews"), store.refresh("hackernews"), store.loadMore("hackernews")]);
    expect(source.calls).toEqual([null]);
  });

  it("detects rising stories across refreshes", async () => {
    let t = 0;
    let score = 10;
    const store = new NewsStore(
      { hackernews: { intervalMs: 1000, fetch: async () => ({ items: [item("https://a", 500), item("https://b", score)], next: null }) } },
      () => t,
    );
    await store.refresh("hackernews");
    t += 3_600_000;
    score = 100;
    await store.refresh("hackernews");
    const byUrl = Object.fromEntries(store.items().map((i) => [i.url, i]));
    expect(byUrl["https://b"]!.rising).toBe(true);
    expect(byUrl["https://a"]!.rising).toBe(false);
  });

  it("schedules and stops timers", () => {
    vi.useFakeTimers();
    const source = pagedSource(1, 1);
    const store = new NewsStore({ hackernews: source });
    store.start();
    vi.advanceTimersByTime(1000);
    store.stop();
    vi.advanceTimersByTime(5000);
    expect(source.calls.length).toBeLessThanOrEqual(2);
    vi.useRealTimers();
  });
});

describe("Searcher", () => {
  it("combines collected matches with live platform search and caches the result", async () => {
    const live = vi.fn(async () => [item("https://live/1", 5, "youtube", "Mars landing live")]);
    const sources = {
      hackernews: { intervalMs: 1000, fetch: async () => ({ items: [item("https://pool/1", 9, "hackernews", "Mars rover news"), item("https://pool/2", 9, "hackernews", "Other")], next: null }) },
      youtube: { intervalMs: 1000, fetch: async () => ({ items: [], next: null }), search: live },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const store = new NewsStore(sources);
    await store.refresh("hackernews");
    const searcher = new Searcher(store, sources);

    const result = await searcher.search("mars", "all", 0);
    expect(result.items.map((i) => i.url)).toEqual(["https://pool/1", "https://live/1"]);
    await searcher.search("MARS", "all", 0);
    expect(live).toHaveBeenCalledTimes(1);
  });

  it("keeps old live results like the platform's own search, ranked below newer ones", async () => {
    const old = { ...item("https://old", 1, "reddit", "storm"), publishedAt: "2020-01-01T00:00:00Z" };
    const undated = item("https://undated", 1, "reddit", "storm");
    const sources = {
      reddit: { intervalMs: 1000, fetch: async () => ({ items: [], next: null }), search: async () => [old, undated] },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const result = await new Searcher(new NewsStore(sources), sources).search("storm", "all", 0);
    expect(result.items.map((i) => i.url)).toEqual(["https://undated", "https://old"]);
  });

  it("orders newest first for latest, passes the sort to the platform, and caches each sort separately", async () => {
    const live = vi.fn(async () => [
      { ...item("https://old-hot", 90, "reddit", "storm"), publishedAt: "2026-01-01T00:00:00Z" },
      { ...item("https://new-cold", 1, "reddit", "storm"), publishedAt: "2026-06-01T00:00:00Z" },
    ]);
    const sources = {
      reddit: { intervalMs: 1000, fetch: async () => ({ items: [], next: null }), search: live },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const searcher = new Searcher(new NewsStore(sources), sources);
    const latest = await searcher.search("storm", "all", 0, "latest");
    expect(latest.items.map((i) => i.url)).toEqual(["https://new-cold", "https://old-hot"]);
    expect(live).toHaveBeenLastCalledWith("storm", 0, "latest");
    await searcher.search("storm", "all", 0, "hot");
    expect(live).toHaveBeenCalledTimes(2);
  });

  it("ranks hot results by how many keywords they match, then by heat", async () => {
    const live = async () => [item("https://hot-loose", 90, "reddit", "anime website"), item("https://cold-exact", 1, "reddit", "make an anime website")];
    const sources = {
      reddit: { intervalMs: 1000, fetch: async () => ({ items: [], next: null }), search: live },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const result = await new Searcher(new NewsStore(sources), sources).search("how to make anime website", "all", 0);
    expect(result.items.map((i) => i.url)).toEqual(["https://cold-exact", "https://hot-loose"]);
  });

  it("finds questions in the collected pool by their keywords", async () => {
    const sources = {
      hackernews: { intervalMs: 1000, fetch: async () => ({ items: [item("https://pool/rice", 9, "hackernews", "Why are rice prices still high?")], next: null }) },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const store = new NewsStore(sources);
    await store.refresh("hackernews");
    const result = await new Searcher(store, sources).search("why is rice price rising", "all", 0);
    expect(result.items.map((i) => i.url)).toEqual(["https://pool/rice"]);
  });

  it("reports a failing platform without failing the search", async () => {
    const sources = {
      twitter: { intervalMs: 1000, fetch: async () => ({ items: [], next: null }), search: async () => { throw new Error("NEED_LOGIN"); } },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const result = await new Searcher(new NewsStore(sources), sources).search("x", "all", 0);
    expect(result).toEqual({ items: [], hasMore: false, errors: [{ platform: "twitter", error: "NEED_LOGIN" }] });
  });
});

describe("HTTP API", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
  });

  async function start(store: NewsStore, sources: Partial<Record<Platform, SourceDef>>): Promise<string> {
    server = createApp(store, new Searcher(store, sources), "http://localhost:3000").listen(0, "127.0.0.1");
    await new Promise((r) => server!.once("listening", r));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it("pages the feed with CORS for the web app only and validates input", async () => {
    const sources = { hackernews: pagedSource(2, 20) };
    const store = new NewsStore(sources);
    const base = await start(store, sources);
    const resp = await fetch(`${base}/api/feed?offset=0&limit=10`, { headers: { Origin: "http://localhost:3000" } });
    expect(resp.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const body = await resp.json();
    expect(body.items).toHaveLength(10);
    expect(body.hasMore).toBe(true);
    expect((await fetch(`${base}/api/feed?platform=myspace`)).status).toBe(400);
    expect((await fetch(`${base}/api/feed?limit=999`)).status).toBe(400);
    expect((await fetch(`${base}/api/search?q=`)).status).toBe(400);
    expect((await fetch(`${base}/api/search?q=a&sort=bad`)).status).toBe(400);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it("rate limits search", async () => {
    const sources = { hackernews: pagedSource(1, 1) };
    const base = await start(new NewsStore(sources), sources);
    const statuses = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await fetch(`${base}/api/search?q=a${i}`)).status);
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
  });

  it("streams status and new-story events", async () => {
    let batch = [item("https://a")];
    const sources = { hackernews: { intervalMs: 1000, fetch: async () => ({ items: batch, next: null }) } };
    const store = new NewsStore(sources);
    await store.refresh("hackernews");
    const base = await start(store, sources);
    const resp = await fetch(`${base}/api/stream`);
    expect(resp.headers.get("content-type")).toBe("text/event-stream");
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    batch = [item("https://b")];
    void store.refresh("hackernews");
    while (!text.includes("event: new")) text += decoder.decode((await reader.read()).value);
    expect(text).toContain("event: status");
    expect(text).toContain('"added":1');
    await reader.cancel();
  });
});

describe("Latest sort", () => {
  it("orders every platform's stories newest first, undated last", async () => {
    const at = (url: string, platform: Platform, iso: string | null) => ({ ...item(url, 1, platform), publishedAt: iso });
    const sources = {
      hackernews: { intervalMs: 1000, fetch: async () => ({ items: [at("https://h-old", "hackernews", "2026-11-01T00:00:00Z"), at("https://h-none", "hackernews", null)], next: null }) },
      reddit: { intervalMs: 1000, fetch: async () => ({ items: [at("https://r-new", "reddit", "2026-11-26T00:00:00Z")], next: null }) },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const store = new NewsStore(sources);
    await store.refresh("hackernews");
    await store.refresh("reddit");
    const page = await store.feed("all", 0, 10, undefined, "latest");
    expect(page.items.map((i) => i.url)).toEqual(["https://r-new", "https://h-old", "https://h-none"]);
  });
});

describe("Latest sort across platforms", () => {
  it("takes the newest story of each platform per round so a huge platform cannot bury the rest", async () => {
    const at = (url: string, platform: Platform, minute: number) => ({ ...item(url, 1, platform), publishedAt: new Date(Date.UTC(2026, 10, 26, 0, minute)).toISOString() });
    const sources = {
      "4chan": { intervalMs: 1000, fetch: async () => ({ items: [at("https://c1", "4chan", 59), at("https://c2", "4chan", 58), at("https://c3", "4chan", 57)], next: null }) },
      reddit: { intervalMs: 1000, fetch: async () => ({ items: [at("https://r1", "reddit", 10)], next: null }) },
    } satisfies Partial<Record<Platform, SourceDef>>;
    const store = new NewsStore(sources);
    await store.refresh("4chan");
    await store.refresh("reddit");
    const page = await store.feed("all", 0, 10, undefined, "latest");
    expect(page.items.map((i) => i.url)).toEqual(["https://c1", "https://r1", "https://c2", "https://c3"]);
  });
});
