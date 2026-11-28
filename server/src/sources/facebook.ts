import { filterByQuery, keywords } from "../feed.js";
import type { Page, RawItem, Sort } from "../types.js";
import { INTERESTS, rotation, stepOf, topicAt } from "./interests.js";
import { runReach } from "./reach.js";

const STEP = 20;
const nextRefresh = rotation(INTERESTS.length, 1);

/** Post-shaped Facebook URLs; the feed drops plain page, profile and group hits from search. */
const POST_URL = /(permalink\.php|story\.php|photo\.php|\/posts\/|\/videos\/|\/watch\/?(?:\?|$)|\/reel\/|fb\.watch)/i;

/**
 * Facebook search works without a login through the shared Agent Reach browser (~15-20 s per query).
 * Every refresh searches the next interest in turn (like the X/Twitter source); the results keep
 * posts and videos and drop page/profile hits.
 */
export async function fetchFacebook(cursor: string | null): Promise<Page> {
  const step = cursor === null ? nextRefresh()[0]! : stepOf(cursor);
  const items = await runReach("facebook", ["facebook", "search", topicAt(step), "--limit", String(STEP)]);
  return { items: items.filter((item) => POST_URL.test(item.url)), next: cursor === null ? "1" : String(step + 1) };
}

/** Facebook's search has no cursor: page 0 answers live, later pages come from the pool. */
export async function searchFacebook(query: string, page: number, sort: Sort = "hot"): Promise<RawItem[]> {
  if (page > 0) return [];
  const items = await runReach("facebook", ["facebook", "search", keywords(query).join(" "), "--limit", String(STEP)]);
  return filterByQuery(items, (item) => `${item.title} ${item.description}`, query);
}
