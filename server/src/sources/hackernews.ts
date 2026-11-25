import * as cheerio from "cheerio";

import { clip, epochIso, stripHtml, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { fetchJson, fetchText } from "./http.js";

const API = "https://hacker-news.firebaseio.com/v0";
const SEARCH_API = "https://hn.algolia.com/api/v1/search";
const LISTS = ["topstories", "beststories", "newstories"]; // ~1,200 ids, top first
const PAGE_SIZE = 30;
const SEARCH_PAGE_SIZE = 20;
const SEARCH_WINDOW_S = 7 * 24 * 3600;
const ARTICLE_TIMEOUT_MS = 8_000;
const META_SELECTORS = ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'];

export interface HnItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  by?: string;
  score?: number;
  descendants?: number;
  time?: number;
  text?: string;
}

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number;
  story_text?: string | null;
}

export function parseHnItem(raw: HnItem | null): RawItem | null {
  if (!raw || raw.type !== "story" || !raw.title) return null;
  const discussionUrl = `https://news.ycombinator.com/item?id=${raw.id}`;
  const url = raw.url ?? discussionUrl;
  const video = videoFor(url);
  return {
    platform: "hackernews",
    title: raw.title,
    url,
    author: raw.by ?? "",
    description: clip(stripHtml(raw.text)),
    publishedAt: epochIso(raw.time),
    discussionUrl,
    video,
    thumbnail: youtubeThumb(video),
    metrics: { score: raw.score ?? 0, comments: raw.descendants ?? 0 },
  };
}

export function parseAlgoliaHit(h: AlgoliaHit): RawItem | null {
  return parseHnItem({
    id: Number(h.objectID),
    type: "story",
    title: h.title,
    url: h.url ?? undefined,
    by: h.author,
    score: h.points ?? 0,
    descendants: h.num_comments ?? 0,
    time: h.created_at_i,
    text: h.story_text ?? undefined,
  });
}

export function parseMetaDescription(html: string): string {
  const $ = cheerio.load(html);
  for (const sel of META_SELECTORS) {
    const value = $(sel).attr("content")?.trim();
    if (value) return clip(value);
  }
  return "";
}

async function withDescription(item: RawItem): Promise<RawItem> {
  if (item.description || item.url === item.discussionUrl) return item;
  try {
    return { ...item, description: parseMetaDescription(await fetchText(item.url, ARTICLE_TIMEOUT_MS)) };
  } catch {
    return item; // article sites fail often; the story still shows without a description
  }
}

async function allIds(): Promise<number[]> {
  const lists = await Promise.all(LISTS.map((l) => fetchJson<number[]>(`${API}/${l}.json`)));
  return [...new Set(lists.flat())];
}

/** cursor = offset into top → best → new. Page 0 is the live front page. */
export async function fetchHackerNews(cursor: string | null): Promise<Page> {
  const offset = Number(cursor ?? 0);
  const ids = await allIds();
  const slice = ids.slice(offset, offset + PAGE_SIZE);
  const raws = await Promise.all(slice.map((id) => fetchJson<HnItem | null>(`${API}/item/${id}.json`)));
  const items = await Promise.all(raws.map(parseHnItem).filter((i): i is RawItem => i !== null).map(withDescription));
  const end = offset + PAGE_SIZE;
  return { items, next: end < ids.length ? String(end) : null };
}

/** Algolia search over the last week, most relevant first. */
export async function searchHackerNews(query: string, page: number): Promise<RawItem[]> {
  const since = Math.floor(Date.now() / 1000) - SEARCH_WINDOW_S;
  const params = new URLSearchParams({
    query,
    tags: "story",
    restrictSearchableAttributes: "title", // body/url matches are mostly noise
    typoTolerance: "false", // "warning" should not match "Warring"
    hitsPerPage: String(SEARCH_PAGE_SIZE),
    page: String(page),
    numericFilters: `created_at_i>${since}`,
  });
  const data = await fetchJson<{ hits?: AlgoliaHit[] }>(`${SEARCH_API}?${params}`);
  return (data.hits ?? []).map(parseAlgoliaHit).filter((i): i is RawItem => i !== null);
}
