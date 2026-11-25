import { clip, decodeEntities, epochIso, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { fetchJson } from "./http.js";
import { runReach } from "./reach.js";
import { hasRedditApi, redditApiGet } from "./reddit-api.js";
import { topicAt } from "./topics.js";

export const SUBREDDITS = [
  "worldnews", "news", "technology", "politics", "science",
  "business", "geopolitics", "UpliftingNews", "Futurology", "europe",
];
const PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 25;
const FALLBACK_PER_SUB = 10;
const FALLBACK_SUBS = 2; // subreddits searched on the first fallback page; deeper pages search one each
const REACH_CURSOR = "reach:";

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

/**
 * Agent Reach's `subreddit` action needs its opencli backend, which breaks when Reddit blocks the IP;
 * its `search` action falls back to public web search (Exa), so the fallback searches per subreddit.
 * Step n searches subreddit n (wrapping) with a topic that changes each lap, so it never runs out.
 */
async function viaAgentReach(step: number, count: number): Promise<RawItem[]> {
  const steps = Array.from({ length: count }, (_, i) => step + i);
  const settled = await Promise.allSettled(
    steps.map((n) => {
      const sub = SUBREDDITS[n % SUBREDDITS.length];
      const topic = topicAt(Math.floor(n / SUBREDDITS.length));
      return runReach("reddit", ["reddit", "search", `r/${sub} ${topic}`, "--limit", String(FALLBACK_PER_SUB)]);
    }),
  );
  const seen = new Set<string>();
  const items = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((it) => it.url.includes("/comments/") && !seen.has(it.url) && Boolean(seen.add(it.url)));
  if (items.length === 0 && settled.every((r) => r.status === "rejected")) {
    const reasons = settled.map((r) => String(((r as PromiseRejectedResult).reason as Error)?.message ?? ""));
    throw new Error(reasons.filter(Boolean).join("; ") || "no posts");
  }
  return items;
}

async function reachPage(step: number, count: number): Promise<Page> {
  return { items: await viaAgentReach(step, count), next: `${REACH_CURSOR}${step + count}` };
}

/**
 * Reddit "hot" across news subreddits, paged with Reddit's `after` cursor; through the official API
 * when REDDIT_CLIENT_ID/SECRET are set, else the public JSON. When Reddit blocks the IP,
 * pages come from Agent Reach search instead (cursor "reach:<step>").
 */
export async function fetchReddit(cursor: string | null): Promise<Page> {
  if (cursor?.startsWith(REACH_CURSOR)) return reachPage(Number(cursor.slice(REACH_CURSOR.length)) || 0, 1);
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), raw_json: "1" });
  if (cursor) params.set("after", cursor);
  try {
    const path = `/r/${SUBREDDITS.join("+")}/hot`;
    const listing = hasRedditApi()
      ? await redditApiGet<Listing>(`${path}?${params}`)
      : await fetchJson<Listing>(`https://www.reddit.com${path}.json?${params}`);
    return { items: parseListing(listing), next: listing.data?.after ?? `${REACH_CURSOR}0` };
  } catch (direct) {
    try {
      return await reachPage(0, cursor ? 1 : FALLBACK_SUBS);
    } catch (fallback) {
      throw new Error(`${(direct as Error).message}; Agent Reach: ${(fallback as Error).message}`);
    }
  }
}

export async function searchReddit(query: string, page: number): Promise<RawItem[]> {
  if (page > 0) return []; // shortcut: Reddit search paging needs `after` state; first page only
  const params = new URLSearchParams({ q: query, sort: "relevance", t: "week", limit: String(SEARCH_PAGE_SIZE), raw_json: "1" });
  try {
    return parseListing(
      hasRedditApi() ? await redditApiGet<Listing>(`/search?${params}`) : await fetchJson<Listing>(`https://www.reddit.com/search.json?${params}`),
    );
  } catch {
    return runReach("reddit", ["reddit", "search", query, "--limit", String(SEARCH_PAGE_SIZE)]);
  }
}
