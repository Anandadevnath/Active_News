import type { Platform } from "@/lib/types";

/** Full class strings per platform (Tailwind only sees literal class names). */
export const ACCENT: Record<Platform, { text: string; border: string; tint: string }> = {
  youtube: { text: "text-youtube", border: "border-youtube", tint: "bg-youtube/10" },
  reddit: { text: "text-reddit", border: "border-reddit", tint: "bg-reddit/10" },
  hackernews: { text: "text-hackernews", border: "border-hackernews", tint: "bg-hackernews/10" },
  "4chan": { text: "text-4chan", border: "border-4chan", tint: "bg-4chan/10" },
  twitter: { text: "text-twitter", border: "border-twitter", tint: "bg-twitter/10" },
  quora: { text: "text-quora", border: "border-quora", tint: "bg-quora/10" },
};

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-ink";
