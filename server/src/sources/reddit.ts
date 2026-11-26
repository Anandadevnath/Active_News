import { clip, decodeEntities, epochIso, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { fetchJson } from "./http.js";
import { ARCTIC_CURSOR, arcticRefresh, arcticSearchPage, arcticStep, type RedditSearchCursor } from "./arctic.js";
import { INTERESTS } from "./interests.js";
import { hasRedditApi, redditApiGet } from "./reddit-api.js";
import { QueryPager } from "./pager.js";

/** Every interest's subreddits (news, gaming, music, sports, ...). */
export const SUBREDDITS = INTERESTS.flatMap((i) => i.subreddits);
const PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 50;

export interface RedditPostData {
  title: string;
  permalink: string;
  url?: string;
  author?: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  stickied?: boolean;
  over_18?: boolean;
  removed_by_category?: string | null;
  subreddit?: string;
  media?: { reddit_video?: { fallback_url?: string } } | null;
  preview?: { images?: { source?: { url?: string } }[] };
}

interface Listing {
  data?: { children?: { data: RedditPostData }[]; after?: string | null };
}

export function parseListing(listing: Listing): RawItem[] {
  return (listing.data?.children ?? [])
    .map((c) => c.data)
    .filter((p) => !p.stickied && !p.removed_by_category && !/^\[\s*(removed|deleted)/i.test(p.title) && p.selftext !== "[removed]")
    .map((p) => {
      const discussionUrl = `https://www.reddit.com${p.permalink}`;
      const url = p.url && !p.url.startsWith("/") ? p.url : discussionUrl;
      const video = videoFor(url, p.media?.reddit_video?.fallback_url);
      const preview = p.preview?.images?.[0]?.source?.url;
      return {
        platform: "reddit" as const,
        title: decodeEntities(p.title),
        url,
        author: p.subreddit ? `r/${p.subreddit} · u/${p.author ?? ""}` : (p.author ?? ""),
        description: clip(p.selftext),
        publishedAt: epochIso(p.created_utc),
        discussionUrl,
        video,
        thumbnail: youtubeThumb(video) ?? (preview ? decodeEntities(preview) : null),
        metrics: { score: p.score ?? 0, comments: p.num_comments ?? 0 },
      };
    });
}

const searchPager = new QueryPager<RedditSearchCursor>();

/**
 * Reddit "hot" across every interest's subreddits through the official API (REDDIT_CLIENT_ID/SECRET) or the
 * public JSON, paged with Reddit's `after`. Reddit blocks many networks (403); then, and after the last `after`
 * page, posts come from the Arctic Shift archive: each refresh reads the next interests, deeper pages go back in time.
 */
export async function fetchReddit(cursor: string | null): Promise<Page> {
  if (cursor?.startsWith(ARCTIC_CURSOR)) return arcticStep(cursor);
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), raw_json: "1" });
  if (cursor) params.set("after", cursor);
  try {
    const path = `/r/${SUBREDDITS.join("+")}/hot`;
    const listing = hasRedditApi()
      ? await redditApiGet<Listing>(`${path}?${params}`)
      : await fetchJson<Listing>(`https://www.reddit.com${path}.json?${params}`);
    return { items: parseListing(listing), next: listing.data?.after ?? `${ARCTIC_CURSOR}0` };
  } catch (direct) {
    try {
      return await arcticRefresh();
    } catch (fallback) {
      throw new Error(`${(direct as Error).message}; ${(fallback as Error).message}`);
    }
  }
}

/** Reddit's own search when reachable, else every post of the query's subreddits plus archive title matches. */
export async function searchReddit(query: string, page: number): Promise<RawItem[]> {
  if (page === 0) {
    const params = new URLSearchParams({ q: query, sort: "relevance", t: "all", limit: String(SEARCH_PAGE_SIZE), raw_json: "1" });
    try {
      const direct = parseListing(
        hasRedditApi() ? await redditApiGet<Listing>(`/search?${params}`) : await fetchJson<Listing>(`https://www.reddit.com/search.json?${params}`),
      );
      if (direct.length > 0) return [...direct, ...(await searchPager.page(query, 0, (c) => arcticSearchPage(query, c)))];
    } catch {
      // blocked network: the archives below cover it
    }
  }
  return searchPager.page(query, page, (c) => arcticSearchPage(query, c));
}
