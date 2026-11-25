import { config } from "../config.js";
import { clip, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { runCli } from "./http.js";

/** Rotated page by page so scrolling keeps finding different news. */
export const QUERIES = [
  "news",
  "breaking news",
  "world news",
  "politics news",
  "technology news",
  "business news",
  "sports news",
  "live news",
];
const PAGE_SIZE = 20;
const MAX_DEPTH = 5; // pages per query (100 videos each)
const REGION = "US"; // results still lean toward the caller's IP region
const LANGUAGE = "en";
const TODAY_BY_VIEWS = "CAMSBAgCEAE%253D"; // `sp` filter: uploaded today, sorted by view count
const THIS_WEEK = "EgIIAw%253D%253D"; // `sp` filter: uploaded this week, relevance order
const TIMEOUT_MS = 90_000;

export interface YtEntry {
  id?: string;
  url?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  description?: string;
  view_count?: number;
}

export function searchUrl(query: string, filter = TODAY_BY_VIEWS): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${filter}&hl=${LANGUAGE}&gl=${REGION}`;
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
    publishedAt: null, // flat search gives no timestamp; the filter bounds the age
    discussionUrl: null,
    video,
    thumbnail: youtubeThumb(video),
    metrics: { views: e.view_count ?? 0 },
  };
}

async function runSearch(url: string, page: number): Promise<RawItem[]> {
  const start = page * PAGE_SIZE + 1;
  const out = await runCli(
    config.ytDlpBin,
    ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-start", String(start), "--playlist-end", String(start + PAGE_SIZE - 1), url],
    TIMEOUT_MS,
  );
  const entries = (JSON.parse(out) as { entries?: YtEntry[] }).entries ?? [];
  return entries.map(parseEntry).filter((i): i is RawItem => i !== null);
}

/** cursor = step n → query QUERIES[n % 8], depth floor(n / 8). Step 0 is "news" today by views. */
export async function fetchYouTube(cursor: string | null): Promise<Page> {
  const step = Number(cursor ?? 0);
  const query = QUERIES[step % QUERIES.length]!;
  const depth = Math.floor(step / QUERIES.length);
  const items = await runSearch(searchUrl(query), depth);
  const next = step + 1 < QUERIES.length * MAX_DEPTH ? String(step + 1) : null;
  return { items, next };
}

export function searchYouTube(query: string, page: number): Promise<RawItem[]> {
  return runSearch(searchUrl(query, THIS_WEEK), page);
}
