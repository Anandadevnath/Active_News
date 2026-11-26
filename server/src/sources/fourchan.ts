import { clip, epochIso, stripHtml } from "../media.js";
import type { Page, RawItem, Video } from "../types.js";
import { filterByQuery, keywords } from "../feed.js";
import { fetchJson } from "./http.js";
import { QueryPager } from "./pager.js";
import { spaced } from "./spaced.js";

const VIDEO_EXTS = new Set([".webm", ".mp4"]);

export interface FourchanThread {
  no: number;
  sticky?: number;
  sub?: string;
  com?: string;
  name?: string;
  replies?: number;
  time?: number;
  tim?: number;
  ext?: string;
}

function media(board: string, t: FourchanThread): { video: Video | null; thumbnail: string | null } {
  if (!t.tim) return { video: null, thumbnail: null };
  const thumbnail = `https://i.4cdn.org/${board}/${t.tim}s.jpg`;
  const ext = (t.ext ?? "").toLowerCase();
  const video: Video | null = VIDEO_EXTS.has(ext) ? { kind: "file", url: `https://i.4cdn.org/${board}/${t.tim}${ext}` } : null;
  return { video, thumbnail };
}

/** Catalog order is bump order, i.e. the threads people are replying to right now. */
export function parseCatalog(pages: { threads?: FourchanThread[] }[], board: string): RawItem[] {
  return pages
    .flatMap((p) => p.threads ?? [])
    .filter((t) => !t.sticky)
    .flatMap((t): RawItem[] => {
      const body = stripHtml(t.com);
      const title = stripHtml(t.sub) || clip(body, 120);
      if (!title) return [];
      return [{
        platform: "4chan",
        title,
        url: `https://boards.4chan.org/${board}/thread/${t.no}`,
        author: t.name ?? "",
        description: body && body !== title ? clip(body) : "",
        publishedAt: epochIso(t.time),
        discussionUrl: null,
        ...media(board, t),
        metrics: { comments: t.replies ?? 0 },
      }];
    });
}

/** Work-safe boards (4chan's ws_board flag); refreshed from boards.json once a day. */
const FALLBACK_BOARDS = "3 a adv an biz c cgl ck cm co diy fa fit g gd his int jp k lgbt lit m mlp mu n news o out p po pw qst sci sp tg toy trv tv v vg vip vm vmg vp vr vrpg vst vt w wsg wsr x xs".split(" ");
const BOARDS_TTL_MS = 24 * 3_600_000;
const API_GAP_MS = 1_100; // 4chan API rule: at most one request per second
const CATALOG_TTL_MS = 5 * 60_000;
const ARCHIVE_PAGE_SIZE = 25; // FoolFuuka returns 25 posts per page
const ARCHIVE_MAX_PAGES = 200; // FoolFuuka stops at 5,000 results per query

// every 4chan API request goes through one queue, spaced API_GAP_MS apart (feed and search share it)
const chanQueue = spaced(API_GAP_MS);
const chanGet = <T>(url: string): Promise<T> => chanQueue(() => fetchJson<T>(url));

let boardList: { at: number; boards: string[] } | null = null;
async function workSafeBoards(now = Date.now()): Promise<string[]> {
  if (boardList && now - boardList.at < BOARDS_TTL_MS) return boardList.boards;
  try {
    const data = await chanGet<{ boards?: { board: string; ws_board?: number }[] }>("https://a.4cdn.org/boards.json");
    const boards = (data.boards ?? []).filter((b) => b.ws_board === 1).map((b) => b.board);
    boardList = { at: now, boards: boards.length > 0 ? boards : FALLBACK_BOARDS };
  } catch {
    boardList = { at: now, boards: FALLBACK_BOARDS };
  }
  return boardList.boards;
}

const catalogs = new Map<string, { at: number; items: RawItem[] }>();

async function boardItems(board: string): Promise<RawItem[]> {
  const hit = catalogs.get(board);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.items;
  const items = parseCatalog(await chanGet<{ threads?: FourchanThread[] }[]>(`https://a.4cdn.org/${board}/catalog.json`), board);
  catalogs.set(board, { at: Date.now(), items });
  return items;
}

/**
 * Every live thread on every work-safe board (~50 boards, ~150 threads each), in bump order per board:
 * the threads people are replying to right now. One pass takes about a minute (1 request per second).
 */
export async function fetchFourchan(): Promise<Page> {
  const boards = await workSafeBoards();
  const perBoard = [];
  for (const board of boards) perBoard.push(await boardItems(board).catch(() => [] as RawItem[]));
  const items = perBoard.flat();
  if (items.length === 0) throw new Error("4chan returned no threads");
  return { items, next: null };
}

// ---- archives: FoolFuuka sites keep every post, including threads 4chan has deleted ----

/** Archive hosts and the work-safe boards each one keeps (checked against their search API). */
export const ARCHIVES: { host: string; boards: string[] }[] = [
  { host: "desuarchive.org", boards: "a an c cgl co fit g his int k m mlp mu tg vr wsg".split(" ") },
  { host: "arch.b4k.dev", boards: "v vg vm vmg vp vrpg vst".split(" ") },
  { host: "archive.palanq.win", boards: "n news p out pw qst toy vip vt w wsr".split(" ") },
  // no reachable archive (4plebs blocks this network): 3 adv biz ck cm diy fa gd jp lgbt lit o po sci sp trv tv x xs, live threads only
];

export interface FoolFuukaPost {
  num?: string;
  thread_num?: string;
  title?: string | null;
  comment?: string | null;
  timestamp?: number;
  board?: { shortname?: string };
  media?: { thumb_link?: string | null } | null;
}

export function parseArchivePost(p: FoolFuukaPost, host: string): RawItem | null {
  const board = p.board?.shortname;
  if (!board || !p.thread_num) return null;
  const body = stripHtml(p.comment).replace(/>>\d+\s*/g, "").trim(); // drop reply links like ">>292451812"
  const title = stripHtml(p.title) || clip(body, 120);
  if (!title) return null;
  const thumb = p.media?.thumb_link;
  return {
    platform: "4chan",
    title,
    url: `https://${host}/${board}/thread/${p.thread_num}/${p.num && p.num !== p.thread_num ? `#${p.num}` : ""}`,
    author: `/${board}/`,
    description: body && body !== title ? clip(body) : "",
    publishedAt: epochIso(p.timestamp),
    discussionUrl: null,
    video: null,
    thumbnail: thumb?.startsWith("https://") ? thumb : null,
    metrics: {},
  };
}

async function archivePage(query: string, page: number): Promise<{ items: RawItem[]; more: boolean }> {
  const results = await Promise.all(
    ARCHIVES.map(async ({ host, boards }) => {
      // type=op: thread starters only; replies match a query's words scattered through chatter
      const params = new URLSearchParams({ boards: boards.join("."), text: keywords(query).join(" "), type: "op", page: String(page) });
      try {
        const data = await fetchJson<Record<string, { posts?: FoolFuukaPost[] }> & { error?: string }>(`https://${host}/_/api/chan/search/?${params}`);
        const posts = data.error ? [] : (data["0"]?.posts ?? []);
        return { items: posts.map((p) => parseArchivePost(p, host)).filter((i): i is RawItem => i !== null), more: posts.length === ARCHIVE_PAGE_SIZE };
      } catch {
        return { items: [], more: false };
      }
    }),
  );
  return { items: results.flatMap((r) => r.items), more: page < ARCHIVE_MAX_PAGES && results.some((r) => r.more) };
}

const searchPager = new QueryPager<number>(); // cursor = archive page (1-based)

/**
 * Page 0: live threads on every work-safe board that mention the query (from the feed's catalogs, no extra
 * requests), most-replied first, plus the first archive page. Later pages: older and older archived threads.
 */
export function searchFourchan(query: string, page: number): Promise<RawItem[]> {
  return searchPager.page(query, page, async (cursor) => {
    const archivePageNo = cursor ?? 1;
    const live =
      archivePageNo === 1
        ? filterByQuery([...catalogs.values()].flatMap((c) => c.items), (i) => `${i.title} ${i.description}`, query).sort(
            (a, b) => (b.metrics.comments ?? 0) - (a.metrics.comments ?? 0),
          )
        : [];
    const archived = await archivePage(query, archivePageNo);
    return { items: [...live, ...archived.items], next: archived.more ? archivePageNo + 1 : null };
  });
}
