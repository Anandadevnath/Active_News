import type { Video } from "./types.js";

export const DESCRIPTION_MAX = 280;
const YOUTUBE_ID_RE = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const TIKTOK_VIDEO_RE = /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)(?:[?#]|$)/i;
const VIDEO_FILE_RE = /^https:\/\/[^\s"']+\.(mp4|webm)(\?[^\s"']*)?$/i;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#039": "'", "#39": "'", nbsp: " " };

export function clip(text: string | null | undefined, limit = DESCRIPTION_MAX): string {
  const flat = (text ?? "").split(/\s+/).filter(Boolean).join(" ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec: string) => ENTITIES[`#${dec}`] ?? String.fromCodePoint(Number(dec)))
    .replace(/&(\w+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

export function stripHtml(html: string | null | undefined): string {
  return decodeEntities((html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).trim();
}

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;
  const parts = parsed.pathname.split("/");
  const candidate = parsed.hostname.endsWith("youtu.be")
    ? parts[1]
    : ["shorts", "embed", "live"].includes(parts[1] ?? "")
      ? parts[2]
      : parsed.searchParams.get("v");
  return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

export function isVideoFile(url: unknown): url is string {
  return typeof url === "string" && VIDEO_FILE_RE.test(url);
}

/** The numeric id of a tiktok.com/@user/video/<id> page; photo posts (and any other link) give null. */
export function tikTokId(url: string | null | undefined): string | null {
  return url ? (TIKTOK_VIDEO_RE.exec(url)?.[1] ?? null) : null;
}

/** Depth-first search of a JSON blob for the first https mp4/webm URL. */
export function findVideoFile(raw: unknown): string | null {
  if (isVideoFile(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const child of Object.values(raw)) {
      const found = findVideoFile(child);
      if (found) return found;
    }
  }
  return null;
}

/** Find the first numeric value under any of the given keys, anywhere in a JSON blob. */
export function findNumber(raw: unknown, keys: readonly string[]): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  for (const [key, value] of Object.entries(raw)) {
    if (keys.includes(key) && typeof value === "number") return value;
  }
  for (const value of Object.values(raw)) {
    const found = findNumber(value, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function videoFor(url: string, fileUrl?: string | null): Video | null {
  const youtube = youtubeId(url);
  if (youtube) return { kind: "youtube", id: youtube };
  const tiktok = tikTokId(url);
  if (tiktok) return { kind: "tiktok", id: tiktok };
  return fileUrl && isVideoFile(fileUrl) ? { kind: "file", url: fileUrl } : null;
}

export function youtubeThumb(video: Video | null): string | null {
  return video?.kind === "youtube" ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null;
}

export function epochIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}
