import { Innertube, Log, type Types } from "youtubei.js";

import { config } from "../config.js";
import { clip, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem, Sort } from "../types.js";
import { runCli } from "./http.js";
import { INTERESTS, rotation } from "./interests.js";
import { QueryPager, type CursorPage } from "./pager.js";

type SearchFilters = Types.SearchFilters;
type UploadDate = NonNullable<SearchFilters["upload_date"]>;

const HOT: SearchFilters = { type: "video", upload_date: "today", prioritize: "popularity" }; // uploaded today, most watched
const LATEST: SearchFilters = { type: "video", upload_date: "today", prioritize: "relevance" };
const ANY_TIME: SearchFilters = { type: "video" }; // search like YouTube itself: relevance, any upload date
const FEED_TTL_MS = 60 * 60_000; // keep deep feed positions an hour, so scrolling never restarts a stream
const REFRESH_STREAMS = 4; // streams re-read per live refresh, taking turns
// newest-first search: YouTube has no upload-date sort any more, so read narrow upload windows first
export const LATEST_WINDOWS: readonly UploadDate[] = ["today", "week", "month", "year", "all"];
const REGION = "US"; // results still lean toward the caller's IP region
const LANGUAGE = "en";
const PAGE_SIZE = 20; // yt-dlp fallback only
const YTDLP_TIMEOUT_MS = 90_000;
const RELATIVE_RE = /(\d+)\s*(second|minute|hour|day|week|month|year|[smhdwy])s?\b/i;
const UNIT_MS: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, y: 31536e6, mo: 2592e6 };

Log.setLevel(Log.Level.ERROR); // the library warns about every unknown renderer

export interface YtEntry {
  id?: string;
  url?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  description?: string;
  view_count?: number;
  published?: string | null; // relative, e.g. "3 hours ago"
}

/** "3 hours ago" / "Streamed 2y ago" -> ISO time; null when unknown. */
export function relativeToIso(text: string | null | undefined, now = Date.now()): string | null {
  const m = RELATIVE_RE.exec(text ?? "");
  if (!m) return null;
  const unit = m[2]!.toLowerCase();
  const key = unit.startsWith("mo") ? "mo" : unit.startsWith("mi") ? "m" : unit[0]!;
  return new Date(now - Number(m[1]) * UNIT_MS[key]!).toISOString();
}

export function parseEntry(e: YtEntry): RawItem | null {
  const url = e.url ?? (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
  const video = url ? videoFor(url) : null;
  if (!url || !e.title || !video) return null;
  return {
    platform: "youtube",
    title: e.title,
    url,
    author: e.channel ?? e.uploader ?? "",
    description: clip(e.description),
    publishedAt: relativeToIso(e.published),
    discussionUrl: null,
    video,
    thumbnail: youtubeThumb(video),
    metrics: { views: e.view_count ?? 0 },
  };
}

// ---- youtubei.js (YouTube's own web API, continuation-token paging) ----

interface YtVideo {
  id?: string;
  title?: { toString(): string };
  author?: { name?: string };
  view_count?: { toString(): string };
  published?: { toString(): string };
  description_snippet?: { toString(): string };
}

interface YtSearch {
  videos: YtVideo[];
  has_continuation: boolean;
  getContinuation(): Promise<YtSearch>;
}

let client: Promise<Innertube> | null = null;
function innertube(): Promise<Innertube> {
  client ??= Innertube.create({ lang: LANGUAGE, location: REGION, retrieve_player: false }).catch((err) => {
    client = null; // retry on the next call
    throw err;
  });
  return client;
}

const digits = (text: string | undefined) => Number((text ?? "").replace(/[^\d]/g, "")) || 0;

export function videoToEntry(v: YtVideo): YtEntry {
  return {
    id: v.id,
    title: v.title?.toString(),
    channel: v.author?.name,
    description: v.description_snippet?.toString(),
    view_count: digits(v.view_count?.toString()),
    published: v.published?.toString() ?? null,
  };
}

/** One video per channel and title, hashtags ignored: some channels post the same live stream many times ("GTA 5 LIVE #gta5 ..."). */
export function dropRepeats(items: readonly RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.author}\u0000${i.title.replace(/#\S+/g, "").replace(/\s+/g, " ").trim().toLowerCase()}`;
    return seen.has(key) ? false : Boolean(seen.add(key));
  });
}

async function searchPage(query: string, filters: SearchFilters, cursor: YtSearch | undefined): Promise<CursorPage<YtSearch>> {
  const result = cursor ? await cursor.getContinuation() : ((await (await innertube()).search(query, filters)) as unknown as YtSearch);
  const items = dropRepeats(result.videos.map(videoToEntry).map(parseEntry).filter((i): i is RawItem => i !== null));
  return { items, next: result.has_continuation ? result : null };
}

// ---- yt-dlp fallback (slower: re-reads every earlier page) ----

const YTDLP_FILTER: Record<"hot" | "any", string> = { hot: "CAMSBAgCEAE%253D", any: "" };

async function ytDlpSearch(query: string, page: number, filter: "hot" | "any"): Promise<RawItem[]> {
  const sp = YTDLP_FILTER[filter] ? `&sp=${YTDLP_FILTER[filter]}` : "";
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${sp}&hl=${LANGUAGE}&gl=${REGION}`;
  const start = page * PAGE_SIZE + 1;
  const out = await runCli(
    config.ytDlpBin,
    ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-start", String(start), "--playlist-end", String(start + PAGE_SIZE - 1), url],
    YTDLP_TIMEOUT_MS,
  );
  const entries = (JSON.parse(out) as { entries?: YtEntry[] }).entries ?? [];
  return entries.map(parseEntry).filter((i): i is RawItem => i !== null);
}

// ---- feed and search ----

/** The feed alternates a "hot today" and a "latest today" stream per interest. */
const STREAMS = INTERESTS.flatMap((i) => [
  { key: `hot:${i.query}`, query: i.query, filters: HOT },
  { key: `latest:${i.query}`, query: i.query, filters: LATEST },
]);
const feedPager = new QueryPager<YtSearch>(undefined, FEED_TTL_MS);
const searchPager = new QueryPager<YtSearch>();
const nextRefresh = rotation(STREAMS.length, REFRESH_STREAMS);

async function streamPage(stream: (typeof STREAMS)[number], depth: number): Promise<RawItem[]> {
  try {
    return await feedPager.page(stream.key, depth, (c) => searchPage(stream.query, stream.filters, c));
  } catch {
    return ytDlpSearch(stream.query, depth, "hot");
  }
}

/**
 * cursor null (live refresh) = the newest page of the next few streams in turn.
 * cursor = step n -> stream n % streams at depth floor(n / streams). Never runs out.
 */
export async function fetchYouTube(cursor: string | null): Promise<Page> {
  if (cursor === null) {
    const pages = await Promise.allSettled(nextRefresh().map((i) => streamPage(STREAMS[i]!, 0)));
    const items = pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
    if (items.length === 0) throw (pages.find((p) => p.status === "rejected") as PromiseRejectedResult | undefined)?.reason ?? new Error("YouTube returned no videos");
    return { items, next: "0" };
  }
  const step = Number(cursor) || 0;
  return { items: await streamPage(STREAMS[step % STREAMS.length]!, Math.floor(step / STREAMS.length)), next: String(step + 1) };
}

/** Newest-first cursor: the upload window being read and YouTube's continuation inside it. */
export interface LatestCursor {
  window: number;
  search?: YtSearch;
}

/** Continue inside the window while YouTube has more, then move to the next, wider window. */
export function nextWindow(window: number, continuation: YtSearch | null): LatestCursor | null {
  if (continuation) return { window, search: continuation };
  return window + 1 < LATEST_WINDOWS.length ? { window: window + 1 } : null;
}

const latestPager = new QueryPager<LatestCursor>();

async function latestPage(query: string, cursor: LatestCursor | undefined): Promise<CursorPage<LatestCursor>> {
  const c = cursor ?? { window: 0 };
  const page = await searchPage(query, { type: "video", upload_date: LATEST_WINDOWS[c.window] }, c.search);
  return { items: page.items, next: nextWindow(c.window, page.next) };
}

/**
 * Hot: every page YouTube's own search returns, continued with its continuation token; no page cap.
 * Latest: today's uploads first, then this week, month, year and any time.
 */
export async function searchYouTube(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  try {
    return sort === "latest"
      ? await latestPager.page(query, page, (c) => latestPage(query, c))
      : await searchPager.page(query, page, (c) => searchPage(query, ANY_TIME, c));
  } catch {
    return ytDlpSearch(query, page, "any");
  }
}
