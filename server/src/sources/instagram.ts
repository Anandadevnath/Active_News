import { clip } from "../media.js";
import type { Page, RawItem } from "../types.js";
import { runOpenCli, type OpenCliRow } from "./browser.js";
import { INSTAGRAM_ACCOUNTS, rotation, stepOf } from "./interests.js";

const OPENCLI_TIMEOUT_MS = 90_000;
const ACCOUNT_LIMIT = "12";
const nextRefresh = rotation(INSTAGRAM_ACCOUNTS.length, 1);

/** A row of the patched `opencli instagram user` adapter (see docs/opencli/instagram-user.js). */
export interface InstagramRow {
  url?: string;
  caption?: string;
  cover?: string;
  video?: string;
  likes?: number;
  comments?: number;
  views?: number;
  taken?: string;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function httpsUrl(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\//.test(value) ? value : null;
}

export function parseInstagramRow(row: InstagramRow, account: string): RawItem | null {
  const url = httpsUrl(row?.url);
  if (!url) return null; // without the permalink the post cannot link, embed or dedupe
  const text = typeof row.caption === "string" ? row.caption : "";
  const video = httpsUrl(row.video);
  return {
    platform: "instagram",
    title: clip(text, 140) || `${account} on Instagram`,
    url,
    author: account,
    description: clip(text),
    publishedAt: isoOrNull(row.taken),
    discussionUrl: null,
    // Video posts carry a signed progressive mp4; photo and carousel posts show their cover image.
    video: video ? { kind: "file", url: video } : null,
    thumbnail: httpsUrl(row.cover),
    metrics: { score: row.likes, comments: row.comments, views: row.views },
  };
}

/**
 * Instagram gates every read behind a login, so this source needs `agent-reach login instagram`
 * once. Each fetch reads one curated account's recent posts through the shared Agent Reach browser;
 * refreshes and deeper pages take turns down the account list, so the pool grows across accounts.
 * Instagram has no post search (only user search), so the pool is searched instead.
 */
export async function fetchInstagram(cursor: string | null): Promise<Page> {
  const step = cursor === null ? nextRefresh()[0]! : stepOf(cursor);
  const account = INSTAGRAM_ACCOUNTS[step % INSTAGRAM_ACCOUNTS.length]!;
  const rows = await runOpenCli("instagram", ["user", account, "--limit", ACCOUNT_LIMIT], OPENCLI_TIMEOUT_MS);
  return {
    items: rows.map((row) => parseInstagramRow(row as InstagramRow, account)).filter((it): it is RawItem => it !== null),
    next: cursor === null ? "1" : String(step + 1),
  };
}
