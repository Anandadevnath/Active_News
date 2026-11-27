import { containsPhrase, dropOrder, filterByQuery, foldAccents, keywords, wordPattern } from "../feed.js";
import { clip, epochIso, stripHtml, videoFor, youtubeThumb } from "../media.js";
import type { Page, RawItem, Sort } from "../types.js";
import { withArticleMeta } from "./article.js";
import { fetchJson } from "./http.js";
import { QueryPager } from "./pager.js";

const API = "https://hacker-news.firebaseio.com/v0";
const LISTS = ["topstories", "beststories", "newstories"]; // ~1,200 ids, top first
const PAGE_SIZE = 30;
const SEARCH_PAGE_SIZE = 50;

export interface HnItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  by?: string;
  score?: number;
  descendants?: number;
  time?: number;
  text?: string;
}

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number;
  story_text?: string | null;
}

export function parseHnItem(raw: HnItem | null): RawItem | null {
  if (!raw || raw.type !== "story" || !raw.title) return null;
  const discussionUrl = `https://news.ycombinator.com/item?id=${raw.id}`;
  const url = raw.url ?? discussionUrl;
  const video = videoFor(url);
  return {
    platform: "hackernews",
    title: raw.title,
    url,
    author: raw.by ?? "",
    description: clip(stripHtml(raw.text)),
    publishedAt: epochIso(raw.time),
    discussionUrl,
    video,
    thumbnail: youtubeThumb(video),
    metrics: { score: raw.score ?? 0, comments: raw.descendants ?? 0 },
  };
}

export function parseAlgoliaHit(h: AlgoliaHit): RawItem | null {
  return parseHnItem({
    id: Number(h.objectID),
    type: "story",
    title: h.title,
    url: h.url ?? undefined,
    by: h.author,
    score: h.points ?? 0,
    descendants: h.num_comments ?? 0,
    time: h.created_at_i,
    text: h.story_text ?? undefined,
  });
}

async function allIds(): Promise<number[]> {
  const lists = await Promise.all(LISTS.map((l) => fetchJson<number[]>(`${API}/${l}.json`)));
  return [...new Set(lists.flat())];
}

const ALGOLIA_CURSOR = "algolia:";
const ALGOLIA_MAX_HITS = 1_000; // Algolia stops paging a query here; a new date window continues past it

interface AlgoliaPage {
  hits?: (AlgoliaHit & { created_at_i?: number })[];
  nbPages?: number;
}

/** Window cursor: page within the current date window, and the window's upper bound (epoch seconds). */
export interface HnCursor {
  page: number;
  before: number | null;
}

/** Next cursor: next page in the same window, or a new window older than the oldest hit once Algolia stops. */
export function nextHnCursor(cursor: HnCursor, data: AlgoliaPage, pageSize: number): HnCursor | null {
  const hits = data.hits ?? [];
  if (hits.length === 0) return null;
  const lastInWindow = cursor.page + 1 >= (data.nbPages ?? 0) || (cursor.page + 1) * pageSize >= ALGOLIA_MAX_HITS;
  if (!lastInWindow) return { page: cursor.page + 1, before: cursor.before };
  const oldest = Math.min(...hits.map((h) => h.created_at_i ?? Infinity));
  return Number.isFinite(oldest) && oldest !== cursor.before ? { page: 0, before: oldest } : null;
}

async function algoliaPage(endpoint: "search" | "search_by_date", params: Record<string, string>, cursor: HnCursor) {
  const query = new URLSearchParams({
    ...params,
    tags: "story",
    hitsPerPage: String(SEARCH_PAGE_SIZE),
    page: String(cursor.page),
    ...(cursor.before ? { numericFilters: `created_at_i<${cursor.before}` } : {}),
  });
  const data = await fetchJson<AlgoliaPage>(`https://hn.algolia.com/api/v1/${endpoint}?${query}`);
  const items = (data.hits ?? []).map(parseAlgoliaHit).filter((i): i is RawItem => i !== null);
  return { items, next: nextHnCursor(cursor, data, SEARCH_PAGE_SIZE) };
}

/**
 * cursor = offset into top -> best -> new (Page 0 is the live front page). After those ~1,200 stories,
 * every older story newest first from Algolia ("algolia:<page>:<before>"), so the feed never ends.
 */
export async function fetchHackerNews(cursor: string | null): Promise<Page> {
  if (cursor?.startsWith(ALGOLIA_CURSOR)) {
    const [page, before] = cursor.slice(ALGOLIA_CURSOR.length).split(":").map(Number);
    const result = await algoliaPage("search_by_date", {}, { page: page || 0, before: before || null });
    return { items: result.items, next: result.next && `${ALGOLIA_CURSOR}${result.next.page}:${result.next.before ?? 0}` };
  }
  const offset = Number(cursor ?? 0);
  const ids = await allIds();
  const slice = ids.slice(offset, offset + PAGE_SIZE);
  const raws = await Promise.all(slice.map((id) => fetchJson<HnItem | null>(`${API}/item/${id}.json`)));
  const items = await Promise.all(raws.map(parseHnItem).filter((i): i is RawItem => i !== null).map(withArticleMeta));
  const end = offset + PAGE_SIZE;
  return { items, next: end < ids.length ? String(end) : `${ALGOLIA_CURSOR}0:0` };
}

const searchPager = new QueryPager<HnCursor>();

/**
 * Every story whose title matches, then older and older date windows; no cap. Hot: most relevant first;
 * latest: newest first. Questions search their keywords, generic words last. With 3+ keywords, when no title
 * has all of them Algolia drops words from the end ("make anime website" -> "anime website"). Every hit is re-checked:
 * Algolia prefix-matches ("ado" finds "adopts"), and a query must never shrink to one loose word ("beat").
 */
export async function searchHackerNews(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  const kws = keywords(query);
  const params = {
    query: dropOrder(kws).join(" "),
    restrictSearchableAttributes: "title", // body/url matches are mostly noise
    typoTolerance: "false", // "warning" should not match "Warring"
    ...(kws.length >= 3 ? { removeWordsIfNoResults: "lastWords" } : {}),
  };
  const endpoint = sort === "latest" ? "search_by_date" : "search";
  const items = await searchPager.page(`${sort}\u0000${query}`, page, (c) => algoliaPage(endpoint, params, c ?? { page: 0, before: null }));
  if (kws.length >= 3) return filterByQuery(items, (i) => i.title, query);
  // Algolia also prefix-matches ("ado" finds "adopts"): keep whole words, plurals ("LLMs") and accented forms ("Pokémon")
  const patterns = kws.map((k) => wordPattern(foldAccents(k), "iu"));
  return items.filter((i) => containsPhrase(i.title, kws.join(" ")) || patterns.every((re) => re.test(foldAccents(i.title))));
}

// ---- live stream ----

const LIVE_RECONNECT_MS = 10_000;
const LIVE_MAX_NEW = 30; // per change; more than this at once only happens after a long disconnect
const LIVE_IDLE_MS = 75_000; // Firebase sends keep-alive every ~30 s, so silence this long means a dead connection

/** Ids in the newest-first list that were not there before. */
export function freshIds(known: ReadonlySet<number>, next: readonly number[]): number[] {
  return next.filter((id) => !known.has(id)).slice(0, LIVE_MAX_NEW);
}

/** The `event:` names of a server-sent event stream, as they arrive. */
async function* sseEvents(body: ReadableStream<Uint8Array>, onChunk: () => void): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    onChunk();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.startsWith("event:")) yield line.slice(6).trim();
  }
}

/**
 * Hacker News' official live stream (Firebase server-sent events on the newest-stories list): every change pushes
 * the new stories at once, so they show within seconds instead of on the next refresh (which reads the top
 * stories, where a new one is rarely listed). Reconnects when the stream drops. Returns a stop function.
 */
export function watchHackerNews(push: (items: RawItem[]) => void): () => void {
  const controller = new AbortController();
  let known: Set<number> | null = null; // null until the first list: the refresh already shows those
  const onChange = async () => {
    const ids = await fetchJson<number[]>(`${API}/newstories.json`);
    const fresh = known ? freshIds(known, ids) : [];
    const raws = await Promise.all(fresh.map((id) => fetchJson<HnItem | null>(`${API}/item/${id}.json`).catch(() => null)));
    // items that failed or are not readable yet stay unknown, so the next change retries them
    const missing = new Set(fresh.filter((_, i) => raws[i] === null));
    known = new Set(ids.filter((id) => !missing.has(id)));
    if (fresh.length === 0) return;
    push(await Promise.all(raws.map(parseHnItem).filter((i): i is RawItem => i !== null).map(withArticleMeta)));
  };
  void (async () => {
    while (!controller.signal.aborted) {
      // watchdog: a silently dead connection (sleep, network switch) is aborted instead of waiting out undici's 300 s timeout
      const idle = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), LIVE_IDLE_MS).unref();
      };
      try {
        arm();
        const resp = await fetch(`${API}/newstories.json`, { headers: { Accept: "text/event-stream" }, signal: AbortSignal.any([controller.signal, idle.signal]) });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status} from Hacker News live stream`);
        for await (const event of sseEvents(resp.body, arm)) {
          if (event === "put" || event === "patch") await onChange().catch((err) => console.error(`[hackernews live] ${err instanceof Error ? err.message : err}`));
        }
      } catch {
        // dropped, refused or idle: reconnect below
      } finally {
        clearTimeout(timer);
      }
      if (!controller.signal.aborted) await new Promise((r) => setTimeout(r, LIVE_RECONNECT_MS).unref());
    }
  })();
  return () => controller.abort();
}
