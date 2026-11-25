import { clip, decodeEntities, epochIso, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { fetchJson } from "./http.js";
import { runReach } from "./reach.js";

export const SUBREDDITS = [
  "worldnews", "news", "technology", "politics", "science",
  "business", "geopolitics", "UpliftingNews", "Futurology", "europe",
];
const PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 25;
const FALLBACK_PER_SUB = 10;

interface RedditPost {
  data: {
    title: string;
    permalink: string;
    url?: string;
    author?: string;
    selftext?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    stickied?: boolean;
    subreddit?: string;
    media?: { reddit_video?: { fallback_url?: string } } | null;
    preview?: { images?: { source?: { url?: string } }[] };
  };
}

interface Listing {
  data?: { children?: RedditPost[]; after?: string | null };
}

export function parseListing(listing: Listing): RawItem[] {
  return (listing.data?.children ?? [])
    .map((c) => c.data)
    .filter((p) => !p.stickied)
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

async function viaAgentReach(): Promise<RawItem[]> {
  const settled = await Promise.allSettled(
    SUBREDDITS.slice(0, 3).map((sub) => runReach("reddit", ["reddit", "subreddit", sub, "--limit", String(FALLBACK_PER_SUB)])),
  );
  const items = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (items.length === 0) {
    const reasons = settled.map((r) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : ""));
    throw new Error(reasons.filter(Boolean).join("; ") || "no posts");
  }
  return items;
}

/** Reddit "hot" across news subreddits, paged with Reddit's `after` cursor. */
export async function fetchReddit(cursor: string | null): Promise<Page> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), raw_json: "1" });
  if (cursor) params.set("after", cursor);
  try {
    const listing = await fetchJson<Listing>(`https://www.reddit.com/r/${SUBREDDITS.join("+")}/hot.json?${params}`);
    return { items: parseListing(listing), next: listing.data?.after ?? null };
  } catch (direct) {
    if (cursor) throw direct; // Agent Reach has no paging; only the first page falls back
    try {
      return { items: await viaAgentReach(), next: null };
    } catch (fallback) {
      throw new Error(`${(direct as Error).message}; Agent Reach: ${(fallback as Error).message}`);
    }
  }
}

export async function searchReddit(query: string, page: number): Promise<RawItem[]> {
  if (page > 0) return []; // shortcut: Reddit search paging needs `after` state; first page only
  const params = new URLSearchParams({ q: query, sort: "relevance", t: "week", limit: String(SEARCH_PAGE_SIZE), raw_json: "1" });
  try {
    return parseListing(await fetchJson<Listing>(`https://www.reddit.com/search.json?${params}`));
  } catch {
    return runReach("reddit", ["reddit", "search", query, "--limit", String(SEARCH_PAGE_SIZE)]);
  }
}
