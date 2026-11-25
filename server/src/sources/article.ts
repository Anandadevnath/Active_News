import * as cheerio from "cheerio";

import { clip } from "../media.js";
import type { RawItem } from "../types.js";
import { fetchText } from "./http.js";

const ARTICLE_TIMEOUT_MS = 8_000;
const DESCRIPTION_SELECTORS = ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'];
const IMAGE_SELECTORS = ['meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]'];
const BLOCKED_HOSTS = ["reddit.com", "redd.it"]; // Reddit answers 403 here; never worth the wait

function firstContent($: cheerio.CheerioAPI, selectors: readonly string[]): string {
  for (const sel of selectors) {
    const value = $(sel).attr("content")?.trim();
    if (value) return value;
  }
  return "";
}

export function parseMetaDescription(html: string): string {
  return clip(firstContent(cheerio.load(html), DESCRIPTION_SELECTORS));
}

/** The page's preview image as an absolute https URL, or null. */
export function parseMetaImage(html: string, pageUrl: string): string | null {
  const raw = firstContent(cheerio.load(html), IMAGE_SELECTORS);
  if (!raw) return null;
  try {
    const abs = new URL(raw, pageUrl);
    return abs.protocol === "https:" ? abs.href : null;
  } catch {
    return null;
  }
}

/** Fill a missing description and/or preview image from the linked article's meta tags. */
export async function withArticleMeta(item: RawItem): Promise<RawItem> {
  const needsText = !item.description;
  const needsImage = !item.thumbnail && !item.video;
  if ((!needsText && !needsImage) || item.url === item.discussionUrl) return item;
  const host = new URL(item.url).hostname;
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return item;
  try {
    const html = await fetchText(item.url, ARTICLE_TIMEOUT_MS);
    return {
      ...item,
      description: needsText ? parseMetaDescription(html) : item.description,
      thumbnail: needsImage ? parseMetaImage(html, item.url) : item.thumbnail,
    };
  } catch {
    return item; // article sites fail often; the story still shows without them
  }
}
