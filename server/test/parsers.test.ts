import { describe, expect, it } from "vitest";

import { parseCatalog } from "../src/sources/fourchan.js";
import { parseHnItem, parseMetaDescription } from "../src/sources/hackernews.js";
import { parseQuoraOutput } from "../src/sources/quora.js";
import { parseReachOutput } from "../src/sources/reach.js";
import { parseListing } from "../src/sources/reddit.js";
import { parseEntry, searchUrl } from "../src/sources/youtube.js";

describe("hacker news", () => {
  it("uses the discussion link when a story has no url", () => {
    const item = parseHnItem({ id: 7, type: "story", title: "Ask HN", by: "pg", score: 5, descendants: 3, time: 0, text: "<p>body</p>" });
    expect(item).toMatchObject({ url: "https://news.ycombinator.com/item?id=7", description: "body", metrics: { score: 5, comments: 3 } });
  });

  it("skips jobs and missing items", () => {
    expect(parseHnItem({ id: 1, type: "job", title: "x" })).toBeNull();
    expect(parseHnItem(null)).toBeNull();
  });

  it("reads og:description before the plain one", () => {
    const html = '<meta name="description" content="plain"><meta property="og:description" content="OG &amp; co">';
    expect(parseMetaDescription(html)).toBe("OG & co");
    expect(parseMetaDescription("<p>none</p>")).toBe("");
  });
});

describe("4chan", () => {
  it("drops stickies, turns webm into video and images into thumbnails", () => {
    const [clipItem, imageItem] = parseCatalog(
      [{ threads: [
        { no: 1, sticky: 1, sub: "rules" },
        { no: 2, sub: "Clip", com: "Big <b>news</b>", replies: 3, time: 1, tim: 99, ext: ".webm" },
        { no: 3, com: "image only", tim: 5, ext: ".jpg" },
      ] }],
      "news",
    );
    expect(clipItem).toMatchObject({ title: "Clip", description: "Big news", video: { kind: "file", url: "https://i.4cdn.org/news/99.webm" } });
    expect(imageItem).toMatchObject({ video: null, thumbnail: "https://i.4cdn.org/news/5s.jpg", description: "" });
  });
});

describe("youtube", () => {
  it("builds an embeddable item and rejects bad entries", () => {
    const item = parseEntry({ id: "dQw4w9WgXcQ", title: "T", channel: "C", description: "D", view_count: 9 });
    expect(item).toMatchObject({ author: "C", video: { kind: "youtube", id: "dQw4w9WgXcQ" }, metrics: { views: 9 } });
    expect(parseEntry({ title: "no id" })).toBeNull();
  });

  it("asks for today's videos sorted by views", () => {
    expect(searchUrl("a b")).toContain("search_query=a%20b");
    expect(searchUrl("news")).toContain("sp=CAMSBAgCEAE%253D");
  });
});

describe("reddit json", () => {
  it("maps hot posts with score, comments and native video", () => {
    const [post] = parseListing({ data: { children: [
      { data: { title: "A &amp; B", permalink: "/r/news/c/1/a/", url: "https://v.redd.it/x", author: "u", subreddit: "news",
        score: 120, num_comments: 40, created_utc: 1, media: { reddit_video: { fallback_url: "https://v.redd.it/x/DASH_720.mp4" } } } },
      { data: { title: "pinned", permalink: "/r/news/2", stickied: true } },
    ] } });
    expect(post).toMatchObject({
      title: "A & B",
      discussionUrl: "https://www.reddit.com/r/news/c/1/a/",
      video: { kind: "file", url: "https://v.redd.it/x/DASH_720.mp4" },
      metrics: { score: 120, comments: 40 },
    });
  });
});

describe("agent reach", () => {
  it("maps items, metrics, videos and youtube links", () => {
    const out = JSON.stringify({ ok: true, items: [
      { title: "T", url: "https://x.com/a/status/1", text: "body", raw: { favorite_count: 50, reply_count: 4, media: "https://video.twimg.com/a.mp4" } },
      { url: "https://youtu.be/dQw4w9WgXcQ", text: "just text" },
      { title: "no url" },
    ] });
    const [tweet, yt] = parseReachOutput(out, "twitter");
    expect(tweet).toMatchObject({ description: "body", metrics: { score: 50, comments: 4 }, video: { kind: "file" } });
    expect(yt).toMatchObject({ title: "just text", description: "", video: { kind: "youtube" } });
  });

  it("turns an error payload into a readable error", () => {
    const out = JSON.stringify({ ok: false, error: { code: "NEED_LOGIN", message: "log in" } });
    expect(() => parseReachOutput(out, "twitter")).toThrow("NEED_LOGIN: log in");
  });
});

describe("quora", () => {
  it("parses items and errors from the python script", () => {
    expect(parseQuoraOutput('{"items":[{"title":"Why?","url":"https://www.quora.com/Why"}]}')[0]).toMatchObject({ platform: "quora", title: "Why?" });
    expect(() => parseQuoraOutput('{"error":"HTTP 403"}')).toThrow("HTTP 403");
  });
});
