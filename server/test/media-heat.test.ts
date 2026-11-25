import { describe, expect, it } from "vitest";

import { interleave, seededRandom, shuffleByHeat } from "../src/feed.js";
import { engagement, scoreItems } from "../src/heat.js";
import { clip, findNumber, findVideoFile, stripHtml, videoFor, youtubeId } from "../src/media.js";
import type { RawItem } from "../src/types.js";

describe("media helpers", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ['https://www.youtube.com/watch?v=bad"id', null],
    ["https://evil.com/watch?v=dQw4w9WgXcQ", null],
    ["not a url", null],
  ])("youtubeId(%s) = %s", (url, expected) => {
    expect(youtubeId(url)).toBe(expected);
  });

  it("clips whitespace and length", () => {
    expect(clip("a  b\n c")).toBe("a b c");
    expect(clip("x".repeat(10), 5)).toBe("xxxx…");
  });

  it("strips html and decodes entities", () => {
    expect(stripHtml("Big <b>news</b> &amp; more&#039;s<br>x")).toBe("Big  news  & more's x");
  });

  it("finds only https video files", () => {
    expect(findVideoFile({ a: [{ b: "https://v.redd.it/x/DASH_720.mp4?source=fallback" }] })).toBe(
      "https://v.redd.it/x/DASH_720.mp4?source=fallback",
    );
    expect(findVideoFile({ a: "http://x/a.mp4", b: "https://x/a.png" })).toBeNull();
  });

  it("finds numbers by key at any depth", () => {
    expect(findNumber({ legacy: { favorite_count: 7 } }, ["favorite_count"])).toBe(7);
    expect(findNumber({ likes: "7" }, ["likes"])).toBeUndefined();
  });

  it("prefers youtube embed over file video", () => {
    expect(videoFor("https://youtu.be/dQw4w9WgXcQ", "https://x/a.mp4")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
    expect(videoFor("https://site/a", "https://x/a.mp4")).toEqual({ kind: "file", url: "https://x/a.mp4" });
    expect(videoFor("https://site/a", "javascript:alert(1).mp4")).toBeNull();
  });
});

const NOW = Date.parse("2026-11-26T12:00:00Z");
const HOUR = 3_600_000;

function raw(url: string, metrics: RawItem["metrics"], hoursAgo: number | null = 1): RawItem {
  return {
    platform: "hackernews",
    title: url,
    url,
    author: "",
    description: "",
    publishedAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * HOUR).toISOString(),
    discussionUrl: null,
    video: null,
    thumbnail: null,
    metrics,
  };
}

describe("heat", () => {
  it("weights comments double and views lightly", () => {
    expect(engagement({ score: 10, comments: 5, views: 1000 })).toBe(30);
  });

  it("normalises so the hottest item is 100 and newer beats older at equal engagement", () => {
    const [fresh, old] = scoreItems([raw("https://a", { score: 100 }, 1), raw("https://b", { score: 100 }, 20)], new Map(), NOW);
    expect(fresh!.heat).toBe(100);
    expect(old!.heat).toBeLessThan(20);
  });

  it("falls back to platform rank when there are no metrics", () => {
    const items = scoreItems([raw("https://a", {}, null), raw("https://b", {}, null)], new Map(), NOW);
    expect(items.map((i) => i.heat)).toEqual([100, 50]);
  });

  it("marks the fastest-growing items as rising", () => {
    const items = [raw("https://a", { score: 500 }, 10), raw("https://b", { score: 50 }, 10)];
    const previous = new Map([
      ["hackernews:https://a", { engagement: 500, at: NOW - HOUR }],
      ["hackernews:https://b", { engagement: 10, at: NOW - HOUR }],
    ]);
    const [a, b] = scoreItems(items, previous, NOW);
    expect(b!.rising).toBe(true);
    expect(a!.rising).toBe(false);
    expect(b!.heat).toBe(100); // +40/hour beats a static 500 points
  });

  it("does not mutate its input", () => {
    const input = [raw("https://a", { score: 1 })];
    const copy = structuredClone(input);
    scoreItems(input, new Map(), NOW);
    expect(input).toEqual(copy);
  });
});

describe("per-visit ordering", () => {
  const many = scoreItems(
    Array.from({ length: 40 }, (_, i) => raw(`https://x/${i}`, { score: 1000 - i * 10 }, 1)),
    new Map(),
    NOW,
  );

  it("is stable for one seed and differs between seeds", () => {
    const a = shuffleByHeat(many, 1).map((i) => i.id);
    expect(shuffleByHeat(many, 1).map((i) => i.id)).toEqual(a);
    expect(shuffleByHeat(many, 2).map((i) => i.id)).not.toEqual(a);
    expect(new Set(a).size).toBe(40);
  });

  it("keeps rising stories at full heat", () => {
    const rising = { ...many[20]!, rising: true, heat: 100 };
    expect(shuffleByHeat([...many, rising], 7)[0]!.id).toBe(rising.id);
  });

  it("hashes into 0..1 and interleaves one per list per round", () => {
    const r = seededRandom(42, "id");
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    const [a, b] = [many.slice(0, 2), many.slice(2, 3)];
    expect(interleave([a, b]).map((i) => i.id)).toEqual([many[0]!.id, many[2]!.id, many[1]!.id]);
  });
});
