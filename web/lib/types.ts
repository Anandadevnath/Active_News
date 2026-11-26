// Browser-side copy of server/src/types.ts. Keep the two in sync.

export const PLATFORMS = ["youtube", "reddit", "hackernews", "4chan", "twitter", "quora", "news"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Filter = Platform | "all";

/** hot: heat, shuffled per visit; latest: newest first. Keep in sync with server/src/types.ts. */
export type Sort = "hot" | "latest";

export type Video = { kind: "youtube"; id: string } | { kind: "file"; url: string };

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
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  hackernews: "Hacker News",
  "4chan": "4chan",
  twitter: "X / Twitter",
  quora: "Quora",
  news: "News sites",
};

/** What the user can do when a platform fails, matched against the server's error text. */
export function fixHint(error: string): string | null {
  if (error.includes("NEED_LOGIN")) return "Log in once: run `agent-reach login twitter` in a terminal.";
  // X answers searches with nothing (not a login error) when the Agent Reach browser is logged out
  if (error.includes("returned no items") || error.includes("UPSTREAM_BROKEN"))
    return "X returned nothing: its search needs a login. Run `agent-reach login twitter` in a terminal and log in to x.com in the window that opens.";
  if (error.includes("Arctic Shift")) return "Reddit is refusing this network and the Reddit archive did not answer. It retries on its own.";
  if (error.includes("Quora")) return "Quora blocked the request or wants a login.";
  if (error.includes("Google News")) return "Google News is limiting requests from this network. It retries on its own in about 2 minutes.";
  if (error.includes("not found")) return "A required tool is missing. See the README setup steps.";
  return null;
}
