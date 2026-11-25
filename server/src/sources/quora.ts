import { config } from "../config.js";
import type { Page, RawItem } from "../types.js";
import { runCli } from "./http.js";

const TIMEOUT_MS = 120_000;

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

/** Scrapling is Python-only, so Quora runs as a small Python script. One page only. */
export async function fetchQuora(): Promise<Page> {
  return { items: parseQuoraOutput(await runCli(config.pythonBin, ["-I", config.quoraScript], TIMEOUT_MS)), next: null };
}
