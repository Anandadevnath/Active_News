import { filterByQuery, keywords } from "../feed.js";
import { clip, stripHtml, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem, Sort } from "../types.js";
import { fetchJson } from "./http.js";
import { INTERESTS, rotation, stepOf } from "./interests.js";
import { QueryPager, type CursorPage } from "./pager.js";

/**
 * Mastodon through mastodon.social's public API, no login: trending posts (from across the fediverse) and hashtag
 * timelines. Full-text search and the live public timeline need a login, so a search reads the query's hashtags
 * ("one piece" -> #onepiece, #one, #piece) and keeps the posts that contain its words.
 */
const BASE = "https://mastodon.social/api/v1";
const LIMIT = 40;
const TREND_PAGES = 5; // trending posts end after a few pages; the feed then pages through each interest's hashtags
const MAX_TAGS = 4;
const TAG_TTL_MS = 60 * 60_000;
const SEARCH_PAGES = 10; // the pager replays earlier pages when its cache expires, so deep pages get costly
const ADULT_TAGS = new Set(["nsfw", "porn", "lewd", "nude", "nudes", "nudity", "hentai", "erotica", "onlyfans", "xxx", "nsfwart", "r18"]);
const FALLBACK = "~"; // cursor prefix: paging the first-keyword timeline because the joined tag is unused

interface MastoMedia {
  type: string; // image | video | gifv | audio
  url?: string | null;
  preview_url?: string | null;
}

interface MastoStatus {
  id: string;
  created_at: string;
  sensitive: boolean;
  spoiler_text: string;
  url: string | null;
  uri: string;
  content: string;
  account: { acct: string; display_name: string };
  media_attachments: MastoMedia[];
  card: { url?: string; title?: string; image?: string | null } | null;
  replies_count: number;
  favourites_count: number;
  reblog?: MastoStatus | null;
  tags?: { name: string }[];
}

const https = (url: string | null | undefined) => (url?.startsWith("https://") ? url : null);
const isAdult = (s: MastoStatus) => (s.tags ?? []).some((t) => ADULT_TAGS.has(t.name.toLowerCase()));

export function parseMastoStatus(status: MastoStatus): RawItem | null {
  const s = status.reblog ?? status;
  if (s.sensitive || s.spoiler_text) return null; // marked sensitive or behind a content warning
  if (isAdult(status) || isAdult(s)) return null; // adult posts not marked sensitive
  const text = stripHtml(s.content);
  const link = https(s.card?.url);
  const postUrl = https(s.url) ?? https(s.uri);
  const title = clip(text, 140) || clip(s.card?.title, 140);
  if (!title || !postUrl) return null;
  const media = s.media_attachments[0];
  const clip_ = media && (media.type === "video" || media.type === "gifv") ? https(media.url) : null;
  const video = (link ? videoFor(link) : null) ?? (clip_ ? videoFor(clip_, clip_) : null);
  const date = Date.parse(s.created_at);
  return {
    platform: "mastodon",
    title,
    url: link ?? postUrl,
    author: s.account.display_name || s.account.acct,
    description: link ? clip(s.card?.title) : title !== clip(text) ? clip(text) : "", // a long post: the rest of its text
    publishedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
    discussionUrl: postUrl,
    video,
    thumbnail: youtubeThumb(video) ?? https(media?.preview_url) ?? https(s.card?.image),
    metrics: { score: s.favourites_count, comments: s.replies_count },
  };
}

const toItems = (statuses: MastoStatus[]) => statuses.map(parseMastoStatus).filter((i): i is RawItem => i !== null);

const tagSlug = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

async function tagTimeline(tag: string, any: readonly string[], maxId?: string): Promise<MastoStatus[]> {
  const params = new URLSearchParams({ limit: String(LIMIT) });
  any.slice(0, MAX_TAGS).forEach((w) => params.append("any[]", w));
  if (maxId) params.set("max_id", maxId);
  return fetchJson<MastoStatus[]>(`${BASE}/timelines/tag/${encodeURIComponent(tag)}?${params}`);
}

/**
 * Posts tagged with all the words joined (#onepiece) or any one of them, newest first; cursor = the last post's id.
 * Mastodon ignores any[] when the path tag was never used, so an empty first page retries with the first word as the
 * path tag (cursor then carries the FALLBACK prefix).
 */
async function tagPage(words: readonly string[], maxId?: string): Promise<CursorPage<string>> {
  const tag = tagSlug(words.join(""));
  if (!tag) return { items: [], next: null };
  const lower = words.map((w) => w.toLowerCase());
  const fallback = () => [tagSlug(lower[0]!), [tag, ...lower.slice(1)]] as const;
  let statuses: MastoStatus[];
  let prefix = "";
  if (maxId?.startsWith(FALLBACK)) {
    const [first, any] = fallback();
    statuses = await tagTimeline(first, any, maxId.slice(FALLBACK.length));
    prefix = FALLBACK;
  } else {
    statuses = await tagTimeline(tag, words.length > 1 ? lower : [], maxId);
    if (statuses.length === 0 && words.length > 1 && !maxId && tagSlug(lower[0]!)) {
      const [first, any] = fallback();
      statuses = await tagTimeline(first, any);
      prefix = FALLBACK;
    }
  }
  const last = statuses.at(-1)?.id;
  return { items: toItems(statuses), next: last ? prefix + last : null };
}

const trends = (offset: number) => fetchJson<MastoStatus[]>(`${BASE}/trends/statuses?limit=${LIMIT}&offset=${offset}`);

const searchPager = new QueryPager<string>();

/** Hashtag timelines are newest first only, so hot and latest read the same pages. */
export async function searchMastodon(query: string, page: number, _sort: Sort = "hot"): Promise<RawItem[]> {
  if (page >= SEARCH_PAGES) return [];
  const items = await searchPager.page(query, page, (maxId) => tagPage(keywords(query), maxId));
  return filterByQuery(items, (i) => `${i.title} ${i.description}`, query);
}

const tagPager = new QueryPager<string>(undefined, TAG_TTL_MS);
const nextInterest = rotation(INTERESTS.length, 1);

/**
 * cursor null (live refresh): trending posts plus the next interest's hashtags, in turn.
 * cursor = step n < TREND_PAGES -> trending page n; after that, interest m % N at depth floor(m / N). Never runs out.
 */
export async function fetchMastodon(cursor: string | null): Promise<Page> {
  if (cursor === null) {
    const interest = INTERESTS[nextInterest()[0]!]!;
    const [hot, topic] = await Promise.allSettled([trends(0), tagPage(keywords(interest.query))]);
    if (hot.status === "rejected" && topic.status === "rejected") throw hot.reason;
    return { items: [...(hot.status === "fulfilled" ? toItems(hot.value) : []), ...(topic.status === "fulfilled" ? topic.value.items : [])], next: "1" };
  }
  const step = stepOf(cursor);
  if (step < TREND_PAGES) {
    const statuses = await trends(step * LIMIT);
    return statuses.length > 0 ? { items: toItems(statuses), next: String(step + 1) } : fetchMastodon(String(TREND_PAGES));
  }
  const n = step - TREND_PAGES;
  const interest = INTERESTS[n % INTERESTS.length]!;
  const items = await tagPager.page(interest.query, Math.floor(n / INTERESTS.length), (maxId) => tagPage(keywords(interest.query), maxId));
  return { items, next: String(step + 1) };
}
