/**
 * Search topics for sources without real paging (Agent Reach search): cursor step n uses topic n,
 * wrapping around, so scrolling never ends. A topic seen again later returns whatever is newest then.
 */
export const TOPICS = [
  "breaking news",
  "world news",
  "politics news",
  "technology news",
  "business news",
  "science news",
  "economy news",
  "AI news",
  "health news",
  "climate news",
  "sports news",
  "election news",
];

export function topicAt(step: number): string {
  return TOPICS[step % TOPICS.length]!;
}

/** Parse a step cursor; null (the live first page) is step 0. */
export function stepOf(cursor: string | null): number {
  const n = Number(cursor ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
