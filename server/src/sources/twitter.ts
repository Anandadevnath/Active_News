import { filterByQuery, keywords } from "../feed.js";
import type { Page, RawItem, Sort } from "../types.js";
import { INTERESTS, rotation, stepOf, topicAt } from "./interests.js";
import { runReach } from "./reach.js";

const STEP = 20;
const LATEST_LIMIT = 40; // latest: one read; X returns top tweets, so later, longer reads bring newer ones out of order
const nextRefresh = rotation(INTERESTS.length, 1);

/**
 * Needs a one-time `agent-reach login twitter` by the user.
 * Agent Reach has no cursor, so each deeper page searches the next topic; the cursor never runs out.
 * Each live refresh searches the next topic in turn.
 */
export async function fetchTwitter(cursor: string | null): Promise<Page> {
  const step = cursor === null ? nextRefresh()[0]! : stepOf(cursor);
  const items = await runReach("twitter", ["twitter", "search", topicAt(step), "--limit", String(STEP)]);
  return { items, next: String(cursor === null ? 1 : step + 1) };
}

/** X's own search is loose (it also matches links and names), so tweets that miss the query's keywords are dropped. */
export async function searchTwitter(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  if (sort === "latest" && page > 0) return [];
  const limit = sort === "latest" ? LATEST_LIMIT : STEP * (page + 1);
  const items = await runReach("twitter", ["twitter", "search", keywords(query).join(" "), "--limit", String(limit)]);
  return filterByQuery(items, (i) => `${i.title} ${i.description}`, query);
}
