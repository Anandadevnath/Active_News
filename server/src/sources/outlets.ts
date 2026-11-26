import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler"; // cheerio's own node types

import { clip } from "../media.js";
import type { RawItem } from "../types.js";
import { withArticleMeta } from "./article.js";
import { fetchText } from "./http.js";

/**
 * News sites read from the outlets' own RSS / Atom feeds (listed per interest in interests.ts). Unlike Google
 * News, these link straight to the article and carry its summary and picture. Feeds have no paging: each lists
 * the newest 10-100 stories.
 */
const FEED_TIMEOUT_MS = 10_000;
const PER_FEED = 20; // newest stories per outlet, so one big feed cannot fill the page
const FEED_MAX_BYTES = 5 * 1024 * 1024; // a cut-off feed still parses up to where it stops
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const TEXT_SELECTORS = ["description", "summary", "content\\:encoded", "content"];
const HTML_SELECTORS = ["content\\:encoded", "content", "description", "summary"];
const DATE_SELECTORS = ["pubDate", "published", "updated", "dc\\:date"];

function httpsUrl(raw: string | undefined, base?: string): string | null {
  if (!raw?.trim()) return null; // new URL("", base) would be the base itself
  try {
    const url = new URL((raw ?? "").trim(), base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const firstText = (item: Cheerio<Element>, selectors: readonly string[]) =>
  selectors.map((sel) => item.find(sel).first().text().trim()).find(Boolean) ?? "";

/** RSS `<link>text</link>` or Atom `<link rel="alternate" href>`. */
function linkOf($: CheerioAPI, item: Cheerio<Element>): string | null {
  const links = item.find("link").toArray().map((el) => $(el));
  const atom = links.find((l) => l.attr("href") && (l.attr("rel") ?? "alternate") === "alternate");
  return httpsUrl(links[0]?.text()) ?? httpsUrl(atom?.attr("href"));
}

/** media:thumbnail / image media:content / image enclosure, else the first <img> in the item's HTML. */
function imageOf($: CheerioAPI, item: Cheerio<Element>, link: string): string | null {
  const media = item
    .find("media\\:content, media\\:thumbnail")
    .toArray()
    .filter((el) => {
      const m = $(el);
      return el.tagName === "media:thumbnail" || m.attr("medium") === "image" || (m.attr("type") ?? "").startsWith("image/") || IMAGE_EXT.test(m.attr("url") ?? "");
    })
    .map((el) => $(el).attr("url"));
  const enclosures = item
    .find("enclosure")
    .toArray()
    .filter((el) => ($(el).attr("type") ?? "").startsWith("image/"))
    .map((el) => $(el).attr("url"));
  const inline = HTML_SELECTORS.map((sel) => item.find(sel).first().text()).map((html) => (html ? cheerio.load(html)("img").first().attr("src") : undefined));
  return [...media, ...enclosures, ...inline].map((u) => httpsUrl(u, link)).find((u) => u !== null) ?? null;
}

/** One outlet feed (RSS 2.0 or Atom) -> stories; the site's domain is the author (feed titles read "RSS: News"). */
export function parseOutletFeed(xml: string): RawItem[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("item, entry")
    .toArray()
    .slice(0, PER_FEED) // feeds list newest first; parsing the rest would be wasted work
    .flatMap((el) => {
      const item = $(el);
      const title = clip(item.children("title").first().text(), 300);
      const url = linkOf($, item);
      if (!title || !url) return [];
      const date = Date.parse(firstText(item, DATE_SELECTORS));
      return [
        {
          platform: "news" as const,
          title,
          url,
          author: new URL(url).hostname.replace(/^www\./, ""),
          description: clip(cheerio.load(firstText(item, TEXT_SELECTORS)).text()),
          publishedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
          discussionUrl: null,
          video: null,
          thumbnail: imageOf($, item, url),
          metrics: {},
        },
      ];
    });
}

/** The newest stories of each outlet; a failing outlet is skipped. Stories without a picture get the article's. */
export async function readOutlets(feeds: readonly string[]): Promise<RawItem[]> {
  const pages = await Promise.allSettled(feeds.map(async (url) => parseOutletFeed(await fetchText(url, FEED_TIMEOUT_MS, FEED_MAX_BYTES))));
  const items = pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
  if (items.length === 0 && feeds.length > 0) {
    throw (pages.find((p) => p.status === "rejected") as PromiseRejectedResult | undefined)?.reason ?? new Error("News sites returned no articles");
  }
  return Promise.all(items.map(withArticleMeta));
}
