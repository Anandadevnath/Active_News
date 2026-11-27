import { describe, expect, it } from "vitest";

import { LatestMerge, type StreamRead } from "../src/latest.js";
import type { NewsItem, Platform } from "../src/types.js";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-27T00:00:00Z");

const story = (id: string, hoursAgo: number | null, platform: Platform = "reddit"): NewsItem => ({
  id,
  platform,
  title: id,
  url: `https://x/${id}`,
  author: "",
  description: "",
  publishedAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * HOUR).toISOString(),
  discussionUrl: null,
  video: null,
  thumbnail: null,
  metrics: {},
  rank: 0,
  heat: 0,
  rising: false,
});

/** A platform whose page n is pages[n]; past the end it has nothing. */
const pagesOf = (...pages: NewsItem[][]): StreamRead => async (n) => pages[n] ?? [];
const range = (prefix: string, from: number, count: number, platform: Platform) =>
  Array.from({ length: count }, (_, i) => story(`${prefix}${i}`, from + i, platform));
const hours = (items: NewsItem[]) => items.map((i) => (NOW - Date.parse(i.publishedAt!)) / HOUR);

describe("Latest search merge", () => {
  it("holds a quiet platform's old stories back until the busy one is read past them, so pages never go back in time", async () => {
    const merge = new LatestMerge({
      reddit: pagesOf(range("r", 0, 25, "reddit"), range("s", 25, 25, "reddit")), // busy: 0-24 h, then 25-49 h
      hackernews: pagesOf([story("hn-new", 3, "hackernews"), story("hn-old", 40_000, "hackernews")]), // quiet: spans years
    });
    const first = await merge.page(0);
    const second = await merge.page(1);
    expect(first.items.map((i) => i.id)).toContain("hn-new");
    expect(first.items.map((i) => i.id)).not.toContain("hn-old");
    expect(Math.max(...hours(first.items))).toBeLessThanOrEqual(Math.min(...hours(second.items)));
    const all = [...first.items, ...second.items, ...(await merge.page(2)).items];
    expect(hours(all)).toEqual([...hours(all)].sort((a, b) => a - b));
    expect(all.at(-1)!.id).toBe("hn-old");
  });

  it("closes each page with a few undated stories and returns the same page when asked again", async () => {
    const merge = new LatestMerge({
      reddit: pagesOf(range("r", 0, 25, "reddit")),
      lemmy: pagesOf(Array.from({ length: 15 }, (_, i) => story(`q${i}`, null, "lemmy"))),
    });
    const first = await merge.page(0);
    expect(first.items.slice(0, 25).every((i) => i.platform === "reddit")).toBe(true);
    expect(first.items.slice(25).map((i) => i.platform)).toEqual(Array(10).fill("lemmy"));
    expect(await merge.page(0)).toBe(first);
  });

  it("shows a story once even when a platform repeats it within one page", async () => {
    const twice = story("dup", 1);
    const merge = new LatestMerge({ reddit: pagesOf([twice, twice, ...range("r", 2, 25, "reddit")]) });
    const ids = (await merge.page(0)).items.map((i) => i.id);
    expect(ids.filter((id) => id === "dup")).toHaveLength(1);
  });

  it("reports a failing platform without holding the others back", async () => {
    const merge = new LatestMerge({
      reddit: pagesOf(range("r", 0, 25, "reddit")),
      twitter: async () => {
        throw new Error("NEED_LOGIN");
      },
    });
    const first = await merge.page(0);
    expect(first.items).toHaveLength(25);
    expect(first.errors).toContainEqual({ platform: "twitter", error: "NEED_LOGIN" });
  });
});
