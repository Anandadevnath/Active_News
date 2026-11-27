// Keep in sync with web/lib/types.ts (the browser-side copy).

export const PLATFORMS = ["youtube", "reddit", "hackernews", "4chan", "twitter", "bluesky", "mastodon", "lemmy", "quora", "news"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Video = { kind: "youtube"; id: string } | { kind: "file"; url: string };

export interface Metrics {
  score?: number;
  comments?: number;
  views?: number;
}

/** What a source returns: no id or heat yet. */
export interface RawItem {
  platform: Platform;
  title: string;
  url: string;
  author: string;
  description: string;
  publishedAt: string | null;
  discussionUrl: string | null;
  video: Video | null;
  thumbnail: string | null;
  metrics: Metrics;
}

export interface NewsItem extends RawItem {
  id: string;
  rank: number; // position in the platform's own trending order, 0 = top
  heat: number; // 0..100, relative to the hottest item on the same platform
  rising: boolean; // engagement grew fastest since the previous refresh
}

/** One page from a source. `next` is an opaque cursor for the following page, null when exhausted. */
export interface Page {
  items: RawItem[];
  next: string | null;
}

export interface SourceStatus {
  platform: Platform;
  count: number; // stories collected so far
  error: string | null;
  updatedAt: string | null;
  refreshing: boolean;
  exhausted: boolean; // no deeper pages left
}

export interface FeedPage {
  items: NewsItem[];
  hasMore: boolean;
  total: number;
}

export interface SearchPage {
  items: NewsItem[];
  hasMore: boolean;
  errors: { platform: Platform; error: string }[];
  partial?: boolean; // a quick first look while `pending` platforms are still searching; ask again for the full page
  pending?: Platform[];
}

/** Titles from the collected pool that continue what is being typed, hottest first. */
export interface Suggestion {
  title: string;
  platform: Platform;
}

export interface SuggestPage {
  suggestions: Suggestion[];
}

export type Filter = Platform | "all";

/** hot: heat, shuffled per visit; latest: newest first. */
export type Sort = "hot" | "latest";
