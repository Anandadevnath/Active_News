import type { Page, RawItem } from "../types.js";
import { runReach } from "./reach.js";
import { stepOf, topicAt } from "./topics.js";

const STEP = 20;

/**
 * Needs a one-time `agent-reach login twitter` by the user.
 * Agent Reach has no cursor, so each deeper page searches the next topic; the cursor never runs out.
 */
export async function fetchTwitter(cursor: string | null): Promise<Page> {
  const step = stepOf(cursor);
  const items = await runReach("twitter", ["twitter", "search", topicAt(step), "--limit", String(STEP)]);
  return { items, next: String(step + 1) };
}

export function searchTwitter(query: string, page: number): Promise<RawItem[]> {
  return runReach("twitter", ["twitter", "search", query, "--limit", String(STEP * (page + 1))]);
}
