import { filterByQuery, keywords } from "../feed.js";
import { clip, isVideoFile, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem, Sort } from "../types.js";
import { fetchJson } from "./http.js";
import { stepOf } from "./interests.js";

/**
 * Lemmy (Reddit-like communities across the fediverse) through lemmy.world's public API, no login: the "Hot" list
 * of every community it knows, page after page, and full search. NSFW posts and communities are dropped.
 */
const BASE = "https://lemmy.world/api/v3";
const SITE = "https://lemmy.world";
const LIMIT = 50;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const MAX_PAGE = 100; // lemmy.world answers 400 past page 100
const SEARCH_BUDGET = 9; // lemmy.world allows ~100 searches per 600 s per IP, and the app prefetches
const SEARCH_WINDOW_MS = 60_000;
let searchTimes: number[] = [];

/** Test helper: forget past searches. */
export const resetLemmySearchBudget = () => {
  searchTimes = [];
};

interface LemmyPostView {
  post: {
    id: number;
    name: string;
    url?: string | null;
    body?: string | null;
    nsfw: boolean;
    published: string;
    thumbnail_url?: string | null;
    embed_description?: string | null;
    embed_video_url?: string | null;
    url_content_type?: string | null;
  };
  community: { name: string; nsfw: boolean };
  counts: { score: number; comments: number };
}

const https = (url: string | null | undefined) => (url?.startsWith("https://") ? url : null);

export function parseLemmyPost(v: LemmyPostView): RawItem | null {
  if (v.post.nsfw || v.community.nsfw) return null;
  const title = clip(v.post.name, 300);
  if (!title) return null;
  const postUrl = `${SITE}/post/${v.post.id}`;
  const link = https(v.post.url);
  const image = link && ((v.post.url_content_type ?? "").startsWith("image/") || IMAGE_EXT.test(link)) ? link : null;
  const file = https(v.post.embed_video_url) ?? (link && isVideoFile(link) ? link : null);
  const video = link ? videoFor(link, file) : null;
  const date = Date.parse(v.post.published);
  return {
    platform: "lemmy",
    title,
    url: link && !image ? link : postUrl, // a picture post opens its discussion
    author: `c/${v.community.name}`,
    description: clip(v.post.body) || clip(v.post.embed_description),
    publishedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
    discussionUrl: postUrl,
    video,
    thumbnail: youtubeThumb(video) ?? image ?? https(v.post.thumbnail_url),
    metrics: { score: v.counts.score, comments: v.counts.comments },
  };
}

const toItems = (posts: LemmyPostView[]) => posts.map(parseLemmyPost).filter((i): i is RawItem => i !== null);

/** cursor null (live refresh) = Hot page 1; cursor n = Hot page n. Ends when Lemmy has no more. */
export async function fetchLemmy(cursor: string | null): Promise<Page> {
  const page = cursor === null ? 1 : Math.max(1, stepOf(cursor));
  const { posts } = await fetchJson<{ posts: LemmyPostView[] }>(`${BASE}/post/list?type_=All&sort=Hot&limit=${LIMIT}&page=${page}`);
  return { items: toItems(posts), next: posts.length > 0 && page < MAX_PAGE ? String(page + 1) : null };
}

/** Hot: best of all time first; latest: newest first. Lemmy matches any word loosely, so results are re-checked. */
export async function searchLemmy(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  if (page + 1 > MAX_PAGE) return [];
  const now = Date.now();
  searchTimes = searchTimes.filter((t) => now - t < SEARCH_WINDOW_MS);
  if (searchTimes.length >= SEARCH_BUDGET) throw new Error("Lemmy search limit reached; retrying soon");
  searchTimes = [...searchTimes, now];
  const params = new URLSearchParams({ q: keywords(query).join(" "), type_: "Posts", listing_type: "All", sort: sort === "latest" ? "New" : "TopAll", limit: String(LIMIT), page: String(page + 1) });
  const { posts } = await fetchJson<{ posts: LemmyPostView[] }>(`${BASE}/search?${params}`);
  return filterByQuery(toItems(posts), (i) => `${i.title} ${i.description}`, query);
}
