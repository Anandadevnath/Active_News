import type { Metrics, NewsItem, RawItem } from "./types.js";

/** Age assumed when a platform gives no timestamp (YouTube search is filtered to "today"). */
const UNKNOWN_AGE_HOURS = 6;
/** HN-style gravity: older items need much more engagement to stay hot. */
const GRAVITY = 1.5;
const RISING_TOP_N = 3;
const MS_PER_HOUR = 3_600_000;

export interface Seen {
  engagement: number;
  at: number; // epoch ms of the refresh that saw it
}

export function engagement(m: Metrics): number {
  return (m.score ?? 0) + 2 * (m.comments ?? 0) + (m.views ?? 0) / 100;
}

export function itemId(item: RawItem): string {
  return `${item.platform}:${item.url}`;
}

function ageHours(publishedAt: string | null, now: number): number {
  const t = publishedAt ? Date.parse(publishedAt) : NaN;
  return Number.isNaN(t) ? UNKNOWN_AGE_HOURS : Math.max(0, (now - t) / MS_PER_HOUR);
}

/**
 * Score one platform's items. Heat = the larger of
 *   - engagement per hour of age (with gravity), and
 *   - measured engagement growth per hour since the previous refresh,
 * normalised so the hottest item on the platform is 100. Items without any
 * metrics fall back to the platform's own ranking order.
 */
export function scoreItems(items: readonly RawItem[], previous: ReadonlyMap<string, Seen>, now: number): NewsItem[] {
  const measured = items.map((item, rank) => {
    const id = itemId(item);
    const eng = engagement(item.metrics);
    const before = previous.get(id);
    const hours = before ? Math.max((now - before.at) / MS_PER_HOUR, 1 / 60) : 0;
    const growth = before ? (eng - before.engagement) / hours : 0;
    const base = eng > 0 ? eng / (ageHours(item.publishedAt, now) + 2) ** GRAVITY : 1 / (rank + 1);
    return { item, id, rank, growth, raw: Math.max(base, growth) };
  });

  const maxRaw = Math.max(...measured.map((m) => m.raw), Number.EPSILON);
  const risingIds = new Set(
    measured
      .filter((m) => m.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, RISING_TOP_N)
      .map((m) => m.id),
  );

  return measured.map(({ item, id, rank, raw }) => ({
    ...item,
    id,
    rank,
    heat: Math.round((100 * raw) / maxRaw),
    rising: risingIds.has(id),
  }));
}

export function rememberEngagement(items: readonly NewsItem[], now: number): Map<string, Seen> {
  return new Map(items.map((i) => [i.id, { engagement: engagement(i.metrics), at: now }]));
}
