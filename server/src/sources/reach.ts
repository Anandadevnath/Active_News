import { config } from "../config.js";
import { clip, findNumber, findVideoFile, videoFor, youtubeThumb } from "../media.js";
import type { Platform, RawItem } from "../types.js";
import { runCli } from "./http.js";

const REACH_TIMEOUT_MS = 120_000;

/** Agent Reach item shape (every channel prints the same fields). */
export interface ReachItem {
  title?: string | null;
  url?: string;
  author?: string | null;
  published_at?: string | null;
  text?: string | null;
  raw?: unknown;
}

interface ReachOutput {
  ok: boolean;
  items?: ReachItem[];
  error?: { code?: string; message?: string } | null;
}

const SCORE_KEYS = ["score", "ups", "like_count", "likes", "favorite_count", "favorites"];
const COMMENT_KEYS = ["num_comments", "comments", "reply_count", "replies"];
const VIEW_KEYS = ["view_count", "views"];
const IMAGE_RE = /\.(jpe?g|png|webp)(\?|$)/i;

/** Preview image: Twitter's video poster, else the first attached image. */
export function findPoster(raw: unknown): string | null {
  const r = (raw ?? {}) as { media_posters?: unknown; media_urls?: unknown };
  const candidates = [r.media_posters, r.media_urls].flatMap((v) => (Array.isArray(v) ? v : []));
  return candidates.find((u): u is string => typeof u === "string" && u.startsWith("https://") && IMAGE_RE.test(u)) ?? null;
}

export function toRawItem(it: ReachItem & { url: string }, platform: Platform): RawItem {
  const text = it.text ?? "";
  const video = videoFor(it.url, findVideoFile(it.raw));
  return {
    platform,
    title: it.title || clip(text, 140),
    url: it.url,
    author: it.author ?? "",
    description: it.title ? clip(text) : "",
    publishedAt: it.published_at ?? null,
    discussionUrl: null,
    video,
    thumbnail: youtubeThumb(video) ?? findPoster(it.raw),
    metrics: {
      score: findNumber(it.raw, SCORE_KEYS),
      comments: findNumber(it.raw, COMMENT_KEYS),
      views: findNumber(it.raw, VIEW_KEYS),
    },
  };
}

export function parseReachOutput(stdout: string, platform: Platform): RawItem[] {
  const data = JSON.parse(stdout) as ReachOutput;
  if (!data.ok) {
    throw new Error(`${data.error?.code ?? "ERROR"}: ${data.error?.message ?? "unknown"}`);
  }
  return (data.items ?? [])
    .filter((it): it is ReachItem & { url: string } => Boolean(it.url))
    .map((it) => toRawItem(it, platform));
}

export async function runReach(platform: Platform, args: readonly string[]): Promise<RawItem[]> {
  return parseReachOutput(await runCli(config.agentReachBin, args, REACH_TIMEOUT_MS), platform);
}
