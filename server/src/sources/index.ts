import type { Page, Platform, RawItem } from "../types.js";
import { fetchFourchan } from "./fourchan.js";
import { fetchHackerNews, searchHackerNews } from "./hackernews.js";
import { fetchQuora } from "./quora.js";
import { fetchReddit, searchReddit } from "./reddit.js";
import { fetchTwitter, searchTwitter } from "./twitter.js";
import { fetchYouTube, searchYouTube } from "./youtube.js";

const MINUTE = 60_000;

export interface SourceDef {
  /** cursor null = the live first page (used for refresh); otherwise a deeper page. */
  fetch: (cursor: string | null) => Promise<Page>;
  /** Live search on the platform itself; platforms without one are searched in the collected pool only. */
  search?: (query: string, page: number) => Promise<RawItem[]>;
  intervalMs: number;
  /** The first page is the platform's complete live set: drop collected items it no longer lists. */
  replaceOnRefresh?: boolean;
}

export const SOURCES: Record<Platform, SourceDef> = {
  hackernews: { fetch: fetchHackerNews, search: searchHackerNews, intervalMs: 2 * MINUTE },
  "4chan": { fetch: fetchFourchan, intervalMs: 2 * MINUTE, replaceOnRefresh: true },
  reddit: { fetch: fetchReddit, search: searchReddit, intervalMs: 10 * MINUTE }, // fallback spends Exa web-search quota
  youtube: { fetch: fetchYouTube, search: searchYouTube, intervalMs: 5 * MINUTE },
  twitter: { fetch: fetchTwitter, search: searchTwitter, intervalMs: 5 * MINUTE },
  quora: { fetch: fetchQuora, intervalMs: 30 * MINUTE }, // fallback spends Exa credit
};
