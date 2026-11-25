import { config } from "../config.js";
import type { Page, RawItem } from "../types.js";
import { runCli } from "./http.js";
import { exaSearch } from "./exa.js";
import { runReach } from "./reach.js";
import { stepOf, topicAt } from "./topics.js";

const TIMEOUT_MS = 120_000;
const FALLBACK_LIMIT = 15;

interface QuoraOutput {
  items?: { title: string; url: string }[];
  error?: string;
}

export function parseQuoraOutput(stdout: string): RawItem[] {
  const data = JSON.parse(stdout) as QuoraOutput;
  if (data.error) throw new Error(data.error);
  return (data.items ?? []).map((q) => ({
    platform: "quora" as const,
    title: q.title,
    url: q.url,
    author: "",
    description: "",
    publishedAt: null,
    discussionUrl: null,
    video: null,
    thumbnail: null,
    metrics: {},
  }));
}

/**
 * Quora questions found by web search, for when Quora blocks the Scrapling fetch:
 * your own Exa key when set, otherwise Agent Reach's shared (rate-limited) Exa search.
 */
export async function viaWebSearch(step = 1): Promise<RawItem[]> {
  const topic = topicAt(step);
  const items = config.exaApiKey
    ? await exaSearch("quora", { query: `Quora question about ${topic}`, domain: "quora.com", limit: FALLBACK_LIMIT })
    : await runReach("quora", ["web", "search", `site:quora.com ${topic}`, "--limit", String(FALLBACK_LIMIT)]);
  return items
    .filter((it) => new URL(it.url).hostname.endsWith("quora.com"))
    .map((it) => ({ ...it, title: it.title.replace(/\s+-\s+Quora$/, "") }));
}

/**
 * First page: Scrapling (Python-only, so a small Python script) on Quora's World News topic.
 * Deeper pages: web search, one topic per page, never running out.
 */
export async function fetchQuora(cursor: string | null = null): Promise<Page> {
  if (cursor !== null) {
    const step = stepOf(cursor);
    return { items: await viaWebSearch(step), next: String(step + 1) };
  }
  try {
    return { items: parseQuoraOutput(await runCli(config.pythonBin, ["-I", config.quoraScript], TIMEOUT_MS)), next: "1" };
  } catch (direct) {
    try {
      return { items: await viaWebSearch(), next: "2" };
    } catch (fallback) {
      throw new Error(`${(direct as Error).message}; Agent Reach: ${(fallback as Error).message}`);
    }
  }
}
