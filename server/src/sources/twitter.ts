import type { Page, RawItem } from "../types.js";
import { runReach } from "./reach.js";

const QUERY = "breaking news";
const STEP = 20;
const MAX = 100;

/**
 * Needs a one-time `agent-reach login twitter` by the user.
 * shortcut: Agent Reach has no cursor, so deeper pages re-run the search with a larger limit
 * and the store drops duplicates; switch to a real cursor if Agent Reach adds one.
 */
export async function fetchTwitter(cursor: string | null): Promise<Page> {
  const limit = Number(cursor ?? STEP);
  const items = await runReach("twitter", ["twitter", "search", QUERY, "--limit", String(limit)]);
  return { items, next: limit + STEP <= MAX && items.length >= limit ? String(limit + STEP) : null };
}

export function searchTwitter(query: string, page: number): Promise<RawItem[]> {
  return runReach("twitter", ["twitter", "search", query, "--limit", String(STEP * (page + 1))]);
}
