import { clip, epochIso, stripHtml } from "../media.js";
import type { Page, RawItem, Video } from "../types.js";
import { fetchJson } from "./http.js";

const BOARD = "news";
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

/** The whole board (~150 live threads) in one request, so there are no deeper pages. */
export async function fetchFourchan(): Promise<Page> {
  const pages = await fetchJson<{ threads?: FourchanThread[] }[]>(`https://a.4cdn.org/${BOARD}/catalog.json`);
  return { items: parseCatalog(pages, BOARD), next: null };
}
