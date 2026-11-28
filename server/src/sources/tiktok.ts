import { config } from "../config.js";
import { clip, epochIso, tikTokId } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { runOpenCli, type OpenCliRow } from "./browser.js";
import { TIKTOK_ACCOUNTS, stepOf } from "./interests.js";
import { runCli } from "./http.js";

const OPENCLI_TIMEOUT_MS = 90_000;
const EXPLORE_LIMIT = 30; // the live trending page re-read on every refresh
const YTDLP_TIMEOUT_MS = 90_000;
const ACCOUNT_ITEMS = "1:30"; // videos read per account page

/** A video row from `opencli tiktok explore` (page-context API), or the flat yt-dlp playlist entry we reshape into it. */
export interface TikTokRow {
  id?: string;
  author?: string;
  url?: string;
  cover?: string;
  title?: string;
  desc?: string;
  plays?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  createTime?: number;
}

export function parseTikTokRow(row: TikTokRow | null): RawItem | null {
  if (!row) return null;
  const url = typeof row.url === "string" && /^https:\/\/(?:www\.)?tiktok\.com\//i.test(row.url) ? row.url : null;
  const id = url ? (typeof row.id === "string" && row.id ? row.id : tikTokId(url)) : null;
  if (!url || !id) return null;
  const desc = clip(typeof row.desc === "string" ? row.desc : row.title ?? "");
  const cover = typeof row.cover === "string" && /^https:\/\//.test(row.cover) ? row.cover : null;
  const video = tikTokId(url); // video posts embed; photo posts become image cards
  return {
    platform: "tiktok",
    title: desc || `TikTok by ${row.author ?? "unknown"}`,
    url,
    author: typeof row.author === "string" ? row.author : "",
    description: desc,
    publishedAt: epochIso(row.createTime),
    discussionUrl: null,
    video: video ? { kind: "tiktok", id: video } : null,
    thumbnail: cover,
    metrics: { views: row.plays, score: row.likes, comments: row.comments },
  };
}

/** `yt-dlp --flat-playlist -J` on a user page: one JSON object with an entries array (no dates). */
export function parsePlaylist(stdout: string, account: string): RawItem[] {
  const data = JSON.parse(stdout) as {
    entries?: { id?: string; url?: string; title?: string; view_count?: number; like_count?: number; comment_count?: number; thumbnails?: { url?: string }[] }[];
  };
  return (data.entries ?? []).flatMap((entry) => {
    if (!entry?.id || !entry.url) return [];
    return [
      parseTikTokRow({
        id: entry.id,
        author: account,
        url: entry.url,
        title: entry.title ?? "",
        cover: entry.thumbnails?.[0]?.url,
        plays: entry.view_count,
        likes: entry.like_count,
        comments: entry.comment_count,
      }),
    ].filter((it): it is RawItem => it !== null);
  });
}

/**
 * TikTok without a login: every refresh re-reads the live trending page through the shared Agent Reach
 * browser (`opencli tiktok explore`); deeper feed pages read curated accounts through yt-dlp. TikTok's
 * own search needs a login, so there is no live search — the pool is searched instead.
 */
export async function fetchTikTok(cursor: string | null): Promise<Page> {
  if (cursor === null) {
    const rows = await runOpenCli("tiktok", ["explore", "--limit", String(EXPLORE_LIMIT)], OPENCLI_TIMEOUT_MS);
    return { items: rows.map((row) => parseTikTokRow(row as TikTokRow)).filter((it): it is RawItem => it !== null), next: "0" };
  }
  const step = stepOf(cursor);
  const account = TIKTOK_ACCOUNTS[step % TIKTOK_ACCOUNTS.length]!;
  const stdout = await runCli(
    config.ytDlpBin,
    ["--flat-playlist", "--playlist-items", ACCOUNT_ITEMS, "-J", `https://www.tiktok.com/@${account}`],
    YTDLP_TIMEOUT_MS,
  );
  return { items: parsePlaylist(stdout, account), next: String(step + 1) };
}
