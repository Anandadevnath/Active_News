import type { Platform } from "@/lib/types";

/** Full class strings per platform (Tailwind only sees literal class names). */
export const ACCENT: Record<Platform, { text: string; border: string; tint: string }> = {
  youtube: { text: "text-youtube", border: "border-youtube", tint: "bg-youtube/10" },
  reddit: { text: "text-reddit", border: "border-reddit", tint: "bg-reddit/10" },
  hackernews: { text: "text-hackernews", border: "border-hackernews", tint: "bg-hackernews/10" },
  "4chan": { text: "text-4chan", border: "border-4chan", tint: "bg-4chan/10" },
  twitter: { text: "text-twitter", border: "border-twitter", tint: "bg-twitter/10" },
  bluesky: { text: "text-bluesky", border: "border-bluesky", tint: "bg-bluesky/10" },
  mastodon: { text: "text-mastodon", border: "border-mastodon", tint: "bg-mastodon/10" },
  lemmy: { text: "text-lemmy", border: "border-lemmy", tint: "bg-lemmy/10" },
  news: { text: "text-news", border: "border-news", tint: "bg-news/10" },
  instagram: { text: "text-instagram", border: "border-instagram", tint: "bg-instagram/10" },
  facebook: { text: "text-facebook", border: "border-facebook", tint: "bg-facebook/10" },
  tiktok: { text: "text-tiktok", border: "border-tiktok", tint: "bg-tiktok/10" },
};

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

/** Short monogram per platform, drawn in a tinted circle where YouTube shows a channel avatar. */
export const MARK: Record<Platform, string> = {
  youtube: "YT",
  reddit: "R",
  hackernews: "HN",
  "4chan": "4c",
  twitter: "X",
  bluesky: "Bs",
  mastodon: "M",
  lemmy: "L",
  news: "N",
  instagram: "IG",
  facebook: "F",
  tiktok: "TT",
};
