const YOUTUBE_ID_RE = /^[\w-]{11}$/;
const TIKTOK_ID_RE = /^\d{10,}$/;
const UNITS: [number, string][] = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [7, "d"],
];

/** "12m ago" style relative time; null for missing or bad timestamps. */
export function timeAgo(iso: string | null, now: number | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t) || now === null) return null;
  let value = Math.max(0, Math.round((now - t) / 1000));
  for (const [size, unit] of UNITS) {
    if (value < size) return `${value}${unit} ago`;
    value = Math.floor(value / size);
  }
  return `${value}w ago`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Only allow http(s) links from scraped data; anything else becomes inert. */
export function safeUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function isYoutubeId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id);
}

export function isTikTokId(id: string): boolean {
  return TIKTOK_ID_RE.test(id);
}
