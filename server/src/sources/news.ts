import * as cheerio from "cheerio";

import { filterByQuery } from "../feed.js";
import type { Page, RawItem, Sort } from "../types.js";
import { fetchText } from "./http.js";
import { INTERESTS, rotation, stepOf } from "./interests.js";
import { readOutlets } from "./outlets.js";
import { QueryPager, type CursorPage } from "./pager.js";
import { spaced } from "./spaced.js";

/**
 * News sites through Google News RSS: any topic or question, from thousands of outlets. Search pages
 * back in time one week at a time (`after:` / `before:`), so it does not run out. Its items have no images, so the
 * feed reads the outlets' own feeds first (outlets.ts) and pages on through Google News after them.
 * Google answers 429 to quick bursts, so requests go one at a time, are cached, and pause after a 429.
 */
const BASE = "https://news.google.com/rss";
const LOCALE = "hl=en-US&gl=US&ceid=US:en";
const GAP_MS = 2_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;
const PAUSE_MS = 2 * 60_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MAX_EMPTY_WEEKS = 4; // per page: a topic silent for a month has no older news worth paging for
const MAX_WEEKS = 52 * 20;
export const RATE_LIMITED = "Google News is limiting requests; retrying soon";

const queue = spaced(GAP_MS);
const cache = new Map<string, { at: number; items: RawItem[] }>();
let pausedUntil = 0;

/** One RSS item -> story. Titles end in " - <source>", which becomes the author. */
export function parseNewsRss(xml: string): RawItem[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("item")
    .toArray()
    .flatMap((el) => {
      const item = $(el);
      const source = item.find("source").text().trim();
      const rawTitle = item.find("title").text().trim();
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      const url = item.find("link").text().trim();
      if (!title || !url.startsWith("https://")) return [];
      const date = Date.parse(item.find("pubDate").text());
      return [
        {
          platform: "news" as const,
          title,
          url,
          author: source,
          description: "",
          publishedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
          discussionUrl: null,
          video: null,
          thumbnail: null,
          metrics: {},
        },
      ];
    });
}

const searchUrl = (q: string) => `${BASE}/search?q=${encodeURIComponent(q)}&${LOCALE}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Week 1 = the last 7 days, week 2 the 7 before, and so on (`before:` is exclusive, so it ends a day later). */
export function weekQuery(query: string, week: number, now = Date.now()): string {
  const end = now - (week - 1) * WEEK_MS;
  return `${query} after:${day(end - WEEK_MS)} before:${day(end + DAY_MS)}`;
}

/** Test hook: forget cached feeds and any 429 pause. */
export function resetNewsState(): void {
  cache.clear();
  pausedUntil = 0;
}

async function getFeed(url: string): Promise<RawItem[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  if (Date.now() < pausedUntil) throw new Error(RATE_LIMITED);
  try {
    const items = parseNewsRss(await queue(() => fetchText(url)));
    cache.set(url, { at: Date.now(), items });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return items;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("HTTP 429")) {
      pausedUntil = Date.now() + PAUSE_MS;
      throw new Error(RATE_LIMITED);
    }
    throw err;
  }
}

/** The next week (from `week` back) that has news; gives up after MAX_EMPTY_WEEKS empty weeks in a row. */
export async function weekPage(query: string, week: number): Promise<CursorPage<number>> {
  for (let w = week; w < week + MAX_EMPTY_WEEKS && w <= MAX_WEEKS; w += 1) {
    const items = await getFeed(searchUrl(weekQuery(query, w)));
    if (items.length > 0) return { items, next: w < MAX_WEEKS ? w + 1 : null };
  }
  return { items: [], next: null };
}

const searchPager = new QueryPager<number>(); // cursor = next week to read

/**
 * Page 0: the most relevant articles (hot) or today's (latest). Later pages: one week at a time, going back.
 * Google also returns loosely related headlines, so only those with the query's keywords are kept.
 */
export async function searchNews(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  const items = await searchPager.page(`${sort}\u0000${query}`, page, async (week) => {
    if (week !== undefined) return weekPage(query, week);
    return { items: await getFeed(searchUrl(sort === "latest" ? `${query} when:1d` : query)), next: 1 };
  });
  // latest: today's articles came on page 0 (when:1d); the weeks after it skip them so pages stay newest first
  const dayAgo = Date.now() - DAY_MS;
  const fresh = sort === "latest" && page > 0 ? items.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) < dayAgo) : items;
  return filterByQuery(fresh, (i) => i.title, query);
}

const nextTopic = rotation(INTERESTS.length, 1);

/**
 * cursor null (live refresh): the world-news outlets plus the next interest's outlets, in turn. Their stories link
 * straight to the article and carry a picture; Google News items do not, so they only come after every outlet.
 * cursor = step n < N -> interest n's outlet feeds; after them, step N + m -> interest m % N, week floor(m / N) + 1
 * back in time on Google News. Never runs out.
 */
export async function fetchNews(cursor: string | null): Promise<Page> {
  if (cursor === null) {
    const interest = INTERESTS[nextTopic()[0]!]!;
    return { items: await readOutlets([...new Set([...INTERESTS[0]!.feeds, ...interest.feeds])]), next: "0" };
  }
  const step = stepOf(cursor);
  if (step < INTERESTS.length) return { items: await readOutlets(INTERESTS[step]!.feeds), next: String(step + 1) };
  const back = step - INTERESTS.length;
  const interest = INTERESTS[back % INTERESTS.length]!;
  const week = Math.floor(back / INTERESTS.length) + 1;
  return { items: await getFeed(searchUrl(weekQuery(interest.query, week))), next: String(step + 1) };
}
