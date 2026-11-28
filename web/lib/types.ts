// Browser-side copy of server/src/types.ts. Keep the two in sync.

export const PLATFORMS = ["youtube", "reddit", "hackernews", "4chan", "twitter", "bluesky", "mastodon", "lemmy", "news", "instagram", "facebook", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Filter = Platform | "all";

/** hot: heat, shuffled per visit; latest: newest first. Keep in sync with server/src/types.ts. */
export type Sort = "hot" | "latest";

export type Video = { kind: "youtube"; id: string } | { kind: "file"; url: string } | { kind: "tiktok"; id: string };

export interface Metrics {
  score?: number;
  comments?: number;
  views?: number;
}

export interface NewsItem {
  id: string;
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
  rank: number;
  heat: number;
  rising: boolean;
}

export interface SourceStatus {
  platform: Platform;
  count: number;
  error: string | null;
  updatedAt: string | null;
  refreshing: boolean;
  exhausted: boolean;
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

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  hackernews: "Hacker News",
  "4chan": "4chan",
  twitter: "X / Twitter",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  lemmy: "Lemmy",
  news: "News sites",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** Topic chips above the feed: each searches every platform for its query (labels match the server's interests). */
export const TOPICS: readonly { label: string; query: string }[] = [
  { label: "News", query: "news" },
  { label: "Tech", query: "technology" },
  { label: "AI", query: "AI" },
  { label: "Gaming", query: "gaming" },
  { label: "Music", query: "music" },
  { label: "Movies & TV", query: "movies" },
  { label: "Anime", query: "anime" },
  { label: "Sports", query: "sports" },
  { label: "Science & space", query: "science" },
  { label: "Money", query: "business" },
  { label: "Food", query: "food" },
  { label: "Health & fitness", query: "fitness" },
  { label: "Travel", query: "travel" },
  { label: "Cars", query: "cars" },
  { label: "Fun", query: "funny" },
  { label: "Learn", query: "explained" },
  { label: "Art & DIY", query: "art" },
  { label: "Books", query: "books" },
];

/** What the user can do when a platform fails, matched against the server's error text. */
export function fixHint(error: string, platform?: Platform): string | null {
  if (/NEED_LOGIN.*facebook/i.test(error))
    return "Log in once: run `agent-reach login facebook` in a terminal and log in to facebook.com in the window that opens.";
  if (/NEED_LOGIN.*instagram/i.test(error))
    return "Log in once: run `agent-reach login instagram` in a terminal and log in to instagram.com in the window that opens.";
  if (error.includes("NEED_LOGIN")) return "Log in once: run `agent-reach login twitter` in a terminal.";
  // X answers searches with nothing (not a login error) when the Agent Reach browser is logged out;
  // Facebook's empty results use the same words, so this hint is scoped to X.
  if (platform === "twitter" && (error.includes("returned no items") || error.includes("UPSTREAM_BROKEN")))
    return "X returned nothing: its search needs a login. Run `agent-reach login twitter` in a terminal and log in to x.com in the window that opens.";
  if (error.includes("Arctic Shift")) return "Reddit is refusing this network and the Reddit archive did not answer. It retries on its own.";
  if (error.includes("Google News")) return "Google News is limiting requests from this network. It retries on its own in about 2 minutes.";
  if (error.includes("not found")) return "A required tool is missing. See the README setup steps.";
  return null;
}
