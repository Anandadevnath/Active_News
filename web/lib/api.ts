import type { FeedPage, Filter, SearchPage, Sort } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getJson<T extends { items: unknown }>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(`${API_URL}${path}?${new URLSearchParams(params)}`, { signal, cache: "no-store" });
  const body = (await resp.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!resp.ok) throw new Error(body?.error ?? `The news server answered ${resp.status}.`);
  if (!body || !Array.isArray(body.items)) throw new Error("The news server sent an unexpected response.");
  return body;
}

/** `seed` picks this visit's order; keep it for every page of one visit so paging stays consistent. */
export function getFeed(filter: Filter, offset: number, limit: number, seed: number, sort: Sort, signal?: AbortSignal): Promise<FeedPage> {
  return getJson<FeedPage>(
    "/api/feed",
    { platform: filter, offset: String(offset), limit: String(limit), seed: String(seed), sort },
    signal,
  );
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function searchNews(query: string, filter: Filter, page: number, sort: Sort, signal?: AbortSignal): Promise<SearchPage> {
  return getJson<SearchPage>("/api/search", { q: query, platform: filter, page: String(page), sort }, signal);
}
