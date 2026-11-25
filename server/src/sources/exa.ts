import { config } from "../config.js";
import { clip } from "../media.js";
import type { Platform, RawItem } from "../types.js";

const EXA_URL = "https://api.exa.ai/search";
const TIMEOUT_MS = 30_000;
const TEXT_CHARS = 600;
const DAY_MS = 86_400_000;

interface ExaResult {
  title?: string | null;
  url?: string;
  publishedDate?: string | null;
  author?: string | null;
  text?: string | null;
}

export interface ExaQuery {
  query: string;
  domain: string;
  limit: number;
  maxAgeDays?: number; // drops pages without a known date, so leave unset for sites that rarely date them
}

export function parseExaResults(results: readonly ExaResult[], platform: Platform): RawItem[] {
  return results
    .filter((r): r is ExaResult & { url: string; title: string } => Boolean(r.url && r.title))
    .map((r) => ({
      platform,
      title: r.title.split("\n")[0]!.trim(), // some titles carry the page's first paragraphs
      url: r.url,
      author: r.author ?? "",
      description: clip(r.text),
      publishedAt: r.publishedDate ?? null,
      discussionUrl: null,
      video: null,
      thumbnail: null,
      metrics: {},
    }));
}

/** Exa search with the user's own key (config.exaApiKey); recent pages from one domain only. */
export async function exaSearch(platform: Platform, q: ExaQuery, now = Date.now()): Promise<RawItem[]> {
  const resp = await fetch(EXA_URL, {
    method: "POST",
    headers: { "x-api-key": config.exaApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: q.query,
      numResults: q.limit,
      includeDomains: [q.domain],
      ...(q.maxAgeDays ? { startPublishedDate: new Date(now - q.maxAgeDays * DAY_MS).toISOString() } : {}),
      contents: { text: { maxCharacters: TEXT_CHARS } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Exa HTTP ${resp.status}${resp.status === 401 ? " (check EXA_API_KEY)" : ""}`);
  const data = (await resp.json()) as { results?: ExaResult[] };
  return parseExaResults(data.results ?? [], platform);
}
