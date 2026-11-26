import type { Page, Platform, RawItem, Sort } from "../types.js";
import { fetchBluesky, searchBluesky } from "./bluesky.js";
import { fetchFourchan, searchFourchan } from "./fourchan.js";
import { fetchHackerNews, searchHackerNews } from "./hackernews.js";
import { fetchNews, searchNews } from "./news.js";
import { fetchQuora, searchQuora } from "./quora.js";
import { fetchReddit, searchReddit } from "./reddit.js";
import { fetchTwitter, searchTwitter } from "./twitter.js";
import { fetchYouTube, searchYouTube } from "./youtube.js";

const MINUTE = 60_000;

export interface SourceDef {
  /** cursor null = the live first page (used for refresh); otherwise a deeper page. */
  fetch: (cursor: string | null) => Promise<Page>;
  /** Live search on the platform itself (newest first for "latest" where it can); without one, only the collected pool is searched. */
  search?: (query: string, page: number, sort: Sort) => Promise<RawItem[]>;
  intervalMs: number;
  /** The first page is the platform's complete live set: drop collected items it no longer lists. */
  replaceOnRefresh?: boolean;
  /** Stories kept ready past the reader's next screenful (default 10); more for slow platforms, so a page is fetched before it is needed. */
  readAhead?: number;
}

export const SOURCES: Record<Platform, SourceDef> = {
  hackernews: { fetch: fetchHackerNews, search: searchHackerNews, intervalMs: 1 * MINUTE },
  "4chan": { fetch: fetchFourchan, search: searchFourchan, intervalMs: 3 * MINUTE, replaceOnRefresh: true }, // one pass reads ~50 boards, 1 per second
  reddit: { fetch: fetchReddit, search: searchReddit, intervalMs: 2 * MINUTE },
  youtube: { fetch: fetchYouTube, search: searchYouTube, intervalMs: 3 * MINUTE },
  twitter: { fetch: fetchTwitter, search: searchTwitter, intervalMs: 5 * MINUTE, readAhead: 60 }, // each deeper page is one ~15 s Agent Reach search
  bluesky: { fetch: fetchBluesky, search: searchBluesky, intervalMs: 3 * MINUTE }, // public API, no login
  quora: { fetch: fetchQuora, search: searchQuora, intervalMs: 30 * MINUTE }, // web search spends Exa credit
  news: { fetch: fetchNews, search: searchNews, intervalMs: 5 * MINUTE }, // Google News RSS, spaced 2 s apart
};
