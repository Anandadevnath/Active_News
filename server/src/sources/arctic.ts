import { filterByQuery, keywords } from "../feed.js";
import type { Page, RawItem, Sort } from "../types.js";
import { withArticleMeta } from "./article.js";
import { fetchJson } from "./http.js";
import { INTERESTS, rotation } from "./interests.js";
import { QueryPager, type CursorPage } from "./pager.js";
import { parseListing, type RedditPostData } from "./reddit.js";

/**
 * Arctic Shift (arctic-shift.photon-reddit.com): a public Reddit archive that ingests posts within
 * minutes and keeps every post, so it works when Reddit blocks this network. Scores are snapshots
 * taken at ingestion, so the newest posts show low points.
 * PullPush (api.pullpush.io): a Reddit archive with global title search, about 6 weeks behind.
 * Both are volunteer-run: requests are limited to 4 at a time.
 */
const ARCTIC = "https://arctic-shift.photon-reddit.com/api";
const PULLPUSH = "https://api.pullpush.io/reddit/search/submission/";
const FEED_PER_SUB = 10;
const SEARCH_PER_SUB = 25;
const PULLPUSH_PAGE = 50;
const MAX_TOPIC_SUBS = 5;
const MIN_SUBSCRIBERS = 1_000;
const MAX_CONCURRENT = 4; // each request takes ~1.5s; a search page reads up to 9 subreddits
const REFRESH_GROUPS = 3; // interests re-read per live refresh, taking turns
const FEED_TTL_MS = 60 * 60_000; // keep each interest's position an hour, like the YouTube feed
const FILTERED_PER_SUB = 100; // newest posts read from a subreddit that only partly covers the query
const FILTERED_PAGES = 2; // about the last day of a busy subreddit
const MAX_FILTERED_SUBS = 4;
const MIN_PULLPUSH_MATCHES = 3; // a subreddit needs this many matching posts to count as "talks about it"
const MAX_PULLPUSH_SUBS = 3;
export const ARCTIC_CURSOR = "arctic:";

interface ArcticResponse<T> {
  data?: T[] | null;
  error?: string | null;
}

interface SubredditInfo {
  display_name?: string;
  subscribers?: number;
  over18?: boolean;
}

// tiny semaphore: the archives are shared, volunteer-run services
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const RETRY_DELAY_MS = 1_500;

async function arcticGet<T>(path: string, params: Record<string, string>, retry = true): Promise<T[]> {
  const url = `${ARCTIC}/${path}?${new URLSearchParams(params)}`;
  try {
    const data = await limited(() => fetchJson<ArcticResponse<T>>(url));
    if (data.error) throw new Error(`Arctic Shift: ${data.error}`);
    return data.data ?? [];
  } catch (err) {
    if (!retry) throw err;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS)); // it answers 422 / "Timeout" when busy; one retry
    return arcticGet<T>(path, params, false);
  }
}

const sfw = (posts: readonly RedditPostData[]) => posts.filter((p) => !p.over_18);
export const toItems = (posts: readonly RedditPostData[]): RawItem[] => parseListing({ data: { children: sfw(posts).map((data) => ({ data })) } });
const oldest = (posts: readonly RedditPostData[]) => Math.min(...posts.map((p) => p.created_utc ?? Infinity));

/** Newest posts of one subreddit, older than `before` (epoch seconds) when given. */
export function subredditPosts(subreddit: string, limit: number, before?: number): Promise<RedditPostData[]> {
  return arcticGet<RedditPostData>("posts/search", {
    subreddit,
    limit: String(limit),
    sort: "desc",
    ...(before ? { before: String(Math.floor(before)) } : {}),
  });
}

/** Newest posts of one interest's subreddits, older than `before` when given; `next` continues further back. */
export async function groupPage(subreddits: readonly string[], before?: number): Promise<CursorPage<number>> {
  const perSub = await Promise.all(subreddits.map((s) => subredditPosts(s, FEED_PER_SUB, before).catch(() => [] as RedditPostData[])));
  // each sub pages at its own pace: continue from the newest of the per-sub oldest posts, so nothing is skipped
  const full = perSub.filter((p) => p.length === FEED_PER_SUB);
  const next = full.length > 0 ? Math.max(...full.map(oldest)) : null;
  const items = await Promise.all(toItems(perSub.flat()).map(withArticleMeta)); // preview images of linked articles
  return { items, next };
}

const groupPager = new QueryPager<number>(undefined, FEED_TTL_MS);
const nextRefresh = rotation(INTERESTS.length, REFRESH_GROUPS);

/** Live refresh: the newest posts of the next few interests in turn, so every interest stays current. */
export async function arcticRefresh(): Promise<Page> {
  const pages = await Promise.all(nextRefresh().map((i) => groupPage(INTERESTS[i]!.subreddits)));
  const items = pages.flatMap((p) => p.items);
  if (items.length === 0) throw new Error("Arctic Shift returned no posts");
  return { items, next: `${ARCTIC_CURSOR}0` };
}

/** Deeper feed: cursor "arctic:<n>" = interest n % N, its page floor(n / N) back in time. Never runs out. */
export async function arcticStep(cursor: string): Promise<Page> {
  const step = Number(cursor.slice(ARCTIC_CURSOR.length)) || 0;
  const interest = INTERESTS[step % INTERESTS.length]!;
  const depth = Math.floor(step / INTERESTS.length);
  const items = await groupPager.page(interest.label, depth, (before) => groupPage(interest.subreddits, before));
  return { items, next: `${ARCTIC_CURSOR}${step + 1}` };
}

async function subredditsByPrefix(prefix: string): Promise<SubredditInfo[]> {
  if (prefix.length < 3) return [];
  return arcticGet<SubredditInfo>("subreddits/search", { subreddit_prefix: prefix, limit: "20" });
}

/** Subreddits named after the query. `full`: the whole query names them; `partial`: only its first words do. */
export interface NamedSubreddits {
  full: string[];
  partial: string[];
}

/**
 * Work-safe subreddits named after the query's keywords, biggest first: the keywords joined ("one piece" ->
 * r/OnePiece), else the first two ("taylor swift new album" -> r/TaylorSwift), else the first ("dune part two" -> r/dune).
 * Shorter names keep only r/<name> itself and names that also contain another keyword ("dune" yes, "dunedin" no).
 */
export async function topicSubreddits(query: string): Promise<NamedSubreddits> {
  const words = keywords(query).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const joins = [...new Set([words.join(""), words.slice(0, 2).join(""), words[0] ?? ""])];
  const pick = (subs: SubredditInfo[]) =>
    subs
      .filter((s) => s.display_name && !s.over18 && (s.subscribers ?? 0) >= MIN_SUBSCRIBERS)
      .sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0))
      .slice(0, MAX_TOPIC_SUBS)
      .map((s) => s.display_name!);
  const lookups = await Promise.all(joins.map((join) => subredditsByPrefix(join))); // all at once: each answer takes ~1.5s
  for (const [n, join] of joins.entries()) {
    const found = pick(lookups[n]!);
    if (n === 0 && found.length > 0) return { full: found, partial: [] };
    const others = words.filter((w) => !join.includes(w));
    const kept = found.filter((name) => name.toLowerCase() === join || others.some((w) => name.toLowerCase().includes(w)));
    if (n > 0 && kept.length > 0) return { full: [], partial: kept };
  }
  return { full: [], partial: [] };
}

/**
 * Which subreddits to read for a query, checked against PullPush's matching posts:
 * - whole: every post (named after the whole query, or a shorter name where the query is discussed);
 * - filtered: only posts matching the query (a shorter name nobody discusses it in, like r/Rice for
 *   "rice price rising", and the subreddits with the most matching posts, like r/worldnews).
 */
export function classifySubreddits(named: NamedSubreddits, matches: readonly RedditPostData[]): { whole: string[]; filtered: string[] } {
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of matches) {
    if (!p.subreddit || p.over_18) continue;
    const key = p.subreddit.toLowerCase();
    counts.set(key, { name: p.subreddit, n: (counts.get(key)?.n ?? 0) + 1 });
  }
  const discussed = (name: string) => counts.has(name.toLowerCase());
  const whole = [...named.full, ...named.partial.filter(discussed)];
  const taken = new Set(whole.map((s) => s.toLowerCase()));
  const busiest = [...counts.values()]
    .filter((c) => c.n >= MIN_PULLPUSH_MATCHES && !taken.has(c.name.toLowerCase()))
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_PULLPUSH_SUBS)
    .map((c) => c.name);
  const filtered = [...new Set([...named.partial.filter((s) => !discussed(s)), ...busiest])].slice(0, MAX_FILTERED_SUBS);
  return { whole, filtered };
}

export interface RedditSearchCursor {
  subs: Record<string, number | null>; // whole subreddits: fetch posts before this epoch; null = done
  filtered: Record<string, number | null>; // filtered subreddits, same cursor; read for FILTERED_PAGES pages
  page: number; // pages read so far
  pullpush: number | null | undefined; // undefined = not started (first page, or waiting for the subreddits in latest)
}

async function pullpushTitle(query: string, before?: number): Promise<RedditPostData[]> {
  const params = new URLSearchParams({ title: keywords(query).join(" "), size: String(PULLPUSH_PAGE), sort: "desc", sort_type: "created_utc" });
  if (before) params.set("before", String(Math.floor(before)));
  const data = await limited(() => fetchJson<ArcticResponse<RedditPostData>>(`${PULLPUSH}?${params}`));
  return data.data ?? [];
}

/** Posts of each subreddit older than its cursor, and the next cursors (null once a sub returns a short page). */
async function readSubs(cursors: Record<string, number | null>, limit: number) {
  const names = Object.keys(cursors).filter((s) => cursors[s] !== null);
  const perSub = await Promise.all(names.map((s) => subredditPosts(s, limit, cursors[s] || undefined).catch(() => [] as RedditPostData[])));
  const next = { ...cursors };
  names.forEach((s, i) => {
    next[s] = perSub[i]!.length === limit ? oldest(perSub[i]!) : null;
  });
  return { bySub: new Map(names.map((s, i) => [s, perSub[i]!])), next, fullOldest: perSub.filter((p) => p.length === limit).map(oldest) };
}

/**
 * Latest: drop posts older than `floor` and let every subreddit that had some continue from `floor`, so a quiet
 * subreddit whose page spans months does not put old posts ahead of a busy one's newer posts.
 */
function cutAt(read: Awaited<ReturnType<typeof readSubs>>, floor: number) {
  const next = { ...read.next };
  for (const [s, posts] of read.bySub) if (posts.some((p) => (p.created_utc ?? 0) < floor)) next[s] = floor;
  return { posts: [...read.bySub.values()].flat().filter((p) => (p.created_utc ?? 0) >= floor), next };
}

const postText = (p: RedditPostData) => `${p.title} ${p.selftext ?? ""}`;
const subsActive = (c: RedditSearchCursor) => [...Object.values(c.subs), ...Object.values(c.filtered)].some((v) => v !== null);

/**
 * hot: every post of the query's own subreddits, matching posts of the ones that discuss it, and PullPush title matches.
 * latest: the same, newest first page after page: subreddits are cut at a common time (cutAt), and PullPush
 * (about six weeks behind) waits until the subreddits are read, or runs alone when there are none.
 */
export async function arcticSearchPage(query: string, cursor: RedditSearchCursor | undefined, sort: Sort = "hot"): Promise<CursorPage<RedditSearchCursor>> {
  const latest = sort === "latest";
  let state = cursor;
  let pp: RedditPostData[];
  if (!state) {
    const [named, first] = await Promise.all([
      topicSubreddits(query).catch((): NamedSubreddits => ({ full: [], partial: [] })),
      pullpushTitle(query).catch(() => [] as RedditPostData[]),
    ]);
    pp = first;
    const { whole, filtered } = classifySubreddits(named, filterByQuery(pp, (p) => p.title, query));
    state = { subs: Object.fromEntries(whole.map((s) => [s, 0])), filtered: Object.fromEntries(filtered.map((s) => [s, 0])), page: 0, pullpush: undefined };
  } else {
    const ppDue = state.pullpush !== null && !(latest && subsActive(state));
    pp = ppDue ? await pullpushTitle(query, state.pullpush ?? undefined).catch(() => [] as RedditPostData[]) : [];
  }
  const ppUsed = !(latest && subsActive(state));
  if (!ppUsed) pp = [];
  const [wholeRead, partialRead] = await Promise.all([readSubs(state.subs, SEARCH_PER_SUB), readSubs(state.filtered, FILTERED_PER_SUB)]);
  const floor = latest ? Math.max(-Infinity, ...wholeRead.fullOldest, ...partialRead.fullOldest) : -Infinity;
  const whole = cutAt(wholeRead, floor);
  const partial = cutAt(partialRead, floor);
  const lastFiltered = state.page + 1 >= FILTERED_PAGES;
  const nextFiltered = lastFiltered ? Object.fromEntries(Object.keys(partial.next).map((s) => [s, null])) : partial.next;
  const nextPullpush = !ppUsed ? state.pullpush : pp.length === PULLPUSH_PAGE ? oldest(pp) : null;
  // PullPush title search matches loose words ("one piece of advice"): keep real matches only
  const items = toItems([...whole.posts, ...filterByQuery(partial.posts, postText, query), ...filterByQuery(pp, (p) => p.title, query)]);
  const done = nextPullpush === null && [...Object.values(whole.next), ...Object.values(nextFiltered)].every((v) => v === null);
  return { items, next: done ? null : { subs: whole.next, filtered: nextFiltered, page: state.page + 1, pullpush: nextPullpush } };
}
