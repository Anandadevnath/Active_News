import { filterByQuery, keywords } from "../feed.js";
import { clip, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem, Sort } from "../types.js";
import { fetchJson } from "./http.js";
import { INTERESTS, rotation, topicAt } from "./interests.js";
import { QueryPager, type CursorPage } from "./pager.js";

/**
 * Bluesky through its public API, no login. Search answers on api.bsky.app (public.api.bsky.app refuses it), but
 * its cursor needs a login, so deeper pages ask for posts older than the oldest one shown (`until`). The feed is
 * Bluesky's own "What's Hot" list, which pages with a cursor, plus one interest per refresh.
 * Bluesky videos are HLS streams browsers cannot play without a player library: they show their thumbnail.
 */
const SEARCH_URL = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const HOT_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const LIMIT = 100;
const ADULT_LABELS = new Set(["porn", "sexual", "sexual-figurative", "nudity", "graphic-media", "gore", "!hide"]);
const LOGGED_IN_ONLY = "!no-unauthenticated"; // the author asked not to be shown to logged-out readers
const GIF_HOSTS = /(^|\.)(klipy\.com|tenor\.com|giphy\.com)$/; // Bluesky's GIF picker posts GIFs as links

interface Label {
  val: string;
}

interface BskyPost {
  uri: string;
  author: { handle: string; displayName?: string; labels?: Label[] };
  record: { text?: string; createdAt?: string; labels?: { values?: Label[] } };
  embed?: BskyEmbed;
  indexedAt: string;
  likeCount?: number;
  replyCount?: number;
  labels?: Label[];
}

interface BskyEmbed {
  $type?: string;
  images?: { thumb?: string }[];
  external?: { uri?: string; title?: string; thumb?: string };
  thumbnail?: string; // video
  media?: BskyEmbed; // a quote post with pictures or a link
  record?: { labels?: Label[]; record?: { labels?: Label[] } }; // the quoted post (nested once more with media)
}

const https = (url: string | undefined) => (url?.startsWith("https://") ? url : null);

/** Adult content (on the post, its author or a quoted post), or an author who asked not to be shown without a login. */
function isHidden(p: BskyPost): boolean {
  const quoted = p.embed?.record;
  const labels = [...(p.labels ?? []), ...(p.author.labels ?? []), ...(p.record.labels?.values ?? []), ...(quoted?.labels ?? []), ...(quoted?.record?.labels ?? [])];
  return labels.some((l) => ADULT_LABELS.has(l.val)) || (p.author.labels ?? []).some((l) => l.val === LOGGED_IN_ONLY);
}

/** The time Bluesky received the post; the app's own claimed time when earlier (imported posts), never a future one. */
function postTime(p: BskyPost): string | null {
  const times = [Date.parse(p.record.createdAt ?? ""), Date.parse(p.indexedAt)].filter((t) => !Number.isNaN(t));
  return times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
}

export function parseBskyPost(p: BskyPost): RawItem | null {
  if (isHidden(p)) return null;
  const [, , did, , rkey] = p.uri.split("/"); // at://<did>/app.bsky.feed.post/<rkey>
  const postUrl = `https://bsky.app/profile/${did}/post/${rkey}`; // the DID always resolves; a handle can be "handle.invalid"
  const embed = p.embed?.media ?? p.embed;
  const shared = https(embed?.external?.uri);
  const gif = shared && GIF_HOSTS.test(new URL(shared).hostname) ? shared : null; // a picture, not a link to open
  const link = gif ? null : shared;
  const title = clip(p.record.text, 140) || clip(embed?.external?.title, 140);
  if (!title) return null;
  const video = link ? videoFor(link) : null;
  return {
    platform: "bluesky",
    title,
    url: link ?? postUrl,
    author: p.author.displayName || (p.author.handle === "handle.invalid" ? "" : p.author.handle),
    description: (link ? clip(embed?.external?.title) : "") || (title !== clip(p.record.text) ? clip(p.record.text) : ""), // a long post: the rest of its text
    publishedAt: postTime(p),
    discussionUrl: postUrl,
    video,
    thumbnail: youtubeThumb(video) ?? https(embed?.images?.[0]?.thumb) ?? https(embed?.external?.thumb) ?? gif ?? https(embed?.thumbnail),
    metrics: { score: p.likeCount, comments: p.replyCount },
  };
}

const toItems = (posts: BskyPost[]) => posts.map(parseBskyPost).filter((i): i is RawItem => i !== null);

async function searchPosts(q: string, sort: "top" | "latest", until?: string): Promise<BskyPost[]> {
  const params = new URLSearchParams({ q, sort, limit: String(LIMIT) });
  if (until) params.set("until", until);
  return (await fetchJson<{ posts: BskyPost[] }>(`${SEARCH_URL}?${params}`)).posts;
}

// latest: cursor = `until`, so every post on the next page is older than this page's. Top results are ranked by
// likes across several days, so `until` would skip most of them: hot search reads Bluesky's 100 best only.
const searchPager = new QueryPager<string>();

export async function searchBluesky(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  const items = await searchPager.page(`${sort}\u0000${query}`, page, async (until): Promise<CursorPage<string>> => {
    const posts = await searchPosts(keywords(query).join(" "), sort === "latest" ? "latest" : "top", until);
    if (sort !== "latest") return { items: toItems(posts), next: null };
    const oldest = posts.map(postTime).filter((t): t is string => t !== null).sort()[0]; // Bluesky's `until` compares this same time
    return { items: toItems(posts), next: oldest ?? null };
  });
  return filterByQuery(items, (i) => `${i.title} ${i.description}`, query);
}

async function hotPage(cursor?: string): Promise<Page> {
  const data = await fetchJson<{ feed: { post: BskyPost }[]; cursor?: string }>(`${HOT_URL}&limit=${LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  return { items: toItems(data.feed.map((f) => f.post)), next: data.cursor ?? null };
}

const nextInterest = rotation(INTERESTS.length, 1);

/** cursor null (live refresh): What's Hot plus the top posts of the next interest in turn; deeper: What's Hot pages. */
export async function fetchBluesky(cursor: string | null): Promise<Page> {
  if (cursor !== null) return hotPage(cursor);
  const [hot, topic] = await Promise.allSettled([hotPage(), searchPosts(topicAt(nextInterest()[0]!), "top")]);
  if (hot.status === "rejected" && topic.status === "rejected") throw hot.reason;
  return {
    items: [...(hot.status === "fulfilled" ? hot.value.items : []), ...(topic.status === "fulfilled" ? toItems(topic.value) : [])],
    next: hot.status === "fulfilled" ? hot.value.next : "", // "" = What's Hot from the start, so one failure does not end the feed
  };
}
