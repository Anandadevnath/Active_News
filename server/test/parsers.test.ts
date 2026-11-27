import { describe, expect, it } from "vitest";

import { parseCatalog } from "../src/sources/fourchan.js";
import { parseMetaDescription } from "../src/sources/article.js";
import { parseHnItem } from "../src/sources/hackernews.js";
import { parseReachOutput } from "../src/sources/reach.js";
import { parseListing } from "../src/sources/reddit.js";
import { parseEntry, relativeToIso, videoToEntry } from "../src/sources/youtube.js";

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

  it("turns YouTube's relative upload times into dates", () => {
    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(relativeToIso("3 hours ago", now)).toBe("2026-11-26T09:00:00.000Z");
    expect(relativeToIso("Streamed 2 days ago", now)).toBe("2026-11-24T12:00:00.000Z");
    expect(relativeToIso("5 minutes ago", now)).toBe("2026-11-26T11:55:00.000Z");
    expect(relativeToIso("1 month ago", now)).toBe("2026-10-27T12:00:00.000Z");
    expect(relativeToIso("2y ago", now)).toBe("2024-11-26T12:00:00.000Z");
    expect(relativeToIso(undefined, now)).toBeNull();
  });

  it("maps a youtubei.js video into an entry with numeric views", () => {
    const text = (s: string) => ({ toString: () => s });
    const entry = videoToEntry({ id: "dQw4w9WgXcQ", title: text("T"), author: { name: "C" }, view_count: text("4,196,544 views"), published: text("2y ago") });
    expect(entry).toMatchObject({ id: "dQw4w9WgXcQ", title: "T", channel: "C", view_count: 4196544, published: "2y ago" });
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

describe("Agent Reach poster", () => {
  it("uses Twitter's video poster, else an attached image, never a non-https or video URL", async () => {
    const { findPoster } = await import("../src/sources/reach.js");
    expect(findPoster({ media_posters: ["https://pbs.twimg.com/thumb/a.jpg"], media_urls: ["https://video.twimg.com/v.mp4"] })).toBe("https://pbs.twimg.com/thumb/a.jpg");
    expect(findPoster({ media_urls: ["https://video.twimg.com/v.mp4", "https://pbs.twimg.com/media/b.png?name=large"] })).toBe("https://pbs.twimg.com/media/b.png?name=large");
    expect(findPoster({ media_urls: ["http://x/c.jpg"] })).toBeNull();
    expect(findPoster(null)).toBeNull();
  });
});

describe("Reddit search markdown", () => {
  const text = [
    "# Hacker tries to breach the FEC",
    "",
    "Posted by **u/Cara** in r/news · 8834 points · 240 comments · October 27, 2026 at 6:58 PM UTC",
    "",
    "https://www.reuters.com/technology/fec-2026-10-27/",
    "",
    "## Top comments (50 shown of 240 reported)",
    "",
    "**u/Bard** · 1042 points · October 27, 2026 at 7:13 PM UTC",
    "> The FEC has nothing to do with voting.",
  ].join("\n");

  it("turns a link post into a story pointing at the article, with stats and the top comment", async () => {
    const { redditItemFromText } = await import("../src/sources/reddit-text.js");
    const item = redditItemFromText("https://www.reddit.com/r/news/comments/abc/x/", "Hacker tries to breach the FEC : r/news", text);
    expect(item).toMatchObject({
      title: "Hacker tries to breach the FEC",
      url: "https://www.reuters.com/technology/fec-2026-10-27/",
      discussionUrl: "https://www.reddit.com/r/news/comments/abc/x/",
      author: "r/news · u/Cara",
      description: "Top comment: The FEC has nothing to do with voting.",
      publishedAt: "2026-10-27T18:58:00.000Z",
      metrics: { score: 8834, comments: 240 },
    });
  });

  it("returns null for text in another shape", async () => {
    const { redditItemFromText } = await import("../src/sources/reddit-text.js");
    expect(redditItemFromText("https://www.reddit.com/r/x/comments/1/", "t", "plain text")).toBeNull();
  });
});

describe("article preview image", () => {
  it("reads og:image as an absolute https URL and rejects http", async () => {
    const { parseMetaImage } = await import("../src/sources/article.js");
    expect(parseMetaImage('<meta property="og:image" content="/img/a.jpg">', "https://site.com/post")).toBe("https://site.com/img/a.jpg");
    expect(parseMetaImage('<meta name="twitter:image" content="http://x.com/b.png">', "https://site.com/")).toBeNull();
    expect(parseMetaImage("<p>none</p>", "https://site.com/")).toBeNull();
  });
});

describe("Reddit search markdown without a comments heading", () => {
  it("stops the body at the first comment line and uses it as the top comment", async () => {
    const { parseRedditText } = await import("../src/sources/reddit-text.js");
    const text = "# T\n\nPosted by **u/a** in r/science · 5 points · 2 comments · October 26, 2026 at 2:16 PM UTC\n\nhttps://news.umich.edu/x\n\n...\n\n**u/b** · 617 points · October 26, 2026 at 2:16 PM UTC\n> A cavity is not always drilling.";
    expect(parseRedditText(text)).toMatchObject({ linkUrl: "https://news.umich.edu/x", body: "", topComment: "A cavity is not always drilling." });
  });
});

describe("search matching", () => {
  it("drops question words and needs names as a whole phrase", async () => {
    const { keywords, matchesQuery } = await import("../src/feed.js");
    expect(keywords("Why is the rice price rising?")).toEqual(["rice", "price", "rising"]);
    expect(keywords("what is it")).toEqual(["what", "is", "it"]); // only stop words: keep them all
    expect(matchesQuery("Elden Ring general - Nightreign DLC thread", "elden ring")).toBe(true);
    expect(matchesQuery("ring elden", "elden ring")).toBe(false);
    expect(matchesQuery("One  Piece!", "one piece")).toBe(true);
    expect(matchesQuery("one big piece of cake", "one piece")).toBe(false);
    expect(matchesQuery("one of the best pieces of tech", "one piece")).toBe(false);
    expect(matchesQuery("【Ado】シンカ (Shinka) MV", "【Ado】シンカ")).toBe(true); // words split by punctuation, not spaces
    expect(matchesQuery("Ado - シンカ (bass backing track)", "ado シンカ")).toBe(true);
    expect(matchesQuery("Ladybird adopts Rust", "ado")).toBe(false);
    expect(matchesQuery("Without further ado, the Ado concert", "ado")).toBe(true);
    expect(matchesQuery("one 日本語のテキスト piece", "one piece")).toBe(false); // letters of any script are not a separator
    expect(matchesQuery("I picked the last one. Piece by piece", "one piece")).toBe(false); // nor a sentence break
  });

  it("matches every keyword of a question in any order, then drops keywords from the end when nothing does", async () => {
    const { filterByQuery, matchesQuery } = await import("../src/feed.js");
    expect(matchesQuery("Rice prices keep rising in Japan", "why is rice price rising")).toBe(true);
    expect(matchesQuery("Coal prices rising", "why is rice price rising")).toBe(false);
    const titles = ["Why are rice prices still high?", "Coal prices rising"];
    expect(filterByQuery(titles, (t) => t, "rice price rising")).toEqual(["Why are rice prices still high?"]);
    expect(filterByQuery(["Rice prices rising fast", ...titles], (t) => t, "rice price rising")).toEqual(["Rice prices rising fast"]);
  });

  it("gives up generic words like 'make' before topic words, and ranks titles by keywords matched", async () => {
    const { dropOrder, filterByQuery, keywords, relevance } = await import("../src/feed.js");
    const query = "how to make anime website";
    expect(dropOrder(keywords(query))).toEqual(["anime", "website", "make"]);
    const titles = ["Studio Ghibli makes 38 albums of anime music", "Show HN: an anime websites directory", "Make a website in 10 minutes"];
    expect(filterByQuery(titles, (t) => t, query)).toEqual(["Show HN: an anime websites directory"]);
    expect(titles.map((t) => relevance(t, query))).toEqual([2, 2, 2]);
    expect(relevance("How I made my anime website", query)).toBe(2); // "made" is not "make"
    expect(relevance("Make an anime website with React", query)).toBe(3);
  });

  it("tells a name ('Ado') from the same word in lower case ('without further ado')", async () => {
    const { namedMatch } = await import("../src/feed.js");
    expect(namedMatch("Ado tops the chart", "ado")).toBe(1);
    expect(namedMatch("ADO brings LIDAR to e-bikes", "ado")).toBe(1);
    expect(namedMatch("Without further ado...", "ado")).toBe(0);
    expect(namedMatch("Adopt Me! Roblox update", "ado")).toBe(0);
  });
});

describe("refresh rotation", () => {
  it("covers every index before repeating", async () => {
    const { rotation } = await import("../src/sources/interests.js");
    const next = rotation(5, 2);
    expect([next(), next(), next()]).toEqual([[0, 1], [2, 3], [4, 0]]);
  });
});

describe("YouTube repeats", () => {
  it("keeps one video per channel and title, ignoring hashtags", async () => {
    const { dropRepeats } = await import("../src/sources/youtube.js");
    const v = (id: string, title: string, author = "Paji") => parseEntry({ id: id.repeat(11), title, channel: author })!;
    const kept = dropRepeats([v("a", "GTA 5 LIVE #gta5 #shorts"), v("b", "GTA 5 LIVE #gta5 #pajiislive"), v("c", "GTA 5 LIVE", "Other"), v("d", "Elden Ring tips")]);
    expect(kept.map((i) => i.url.slice(-11))).toEqual(["aaaaaaaaaaa", "ccccccccccc", "ddddddddddd"]);
  });
});

describe("YouTube newest-first windows", () => {
  it("reads each upload window in one page, continues only the last one, and drops uploads of earlier windows", async () => {
    const { nextWindow, windowNewest, LATEST_WINDOWS } = await import("../src/sources/youtube.js");
    const continuation = { videos: [], has_continuation: true, getContinuation: async () => continuation };
    const last = LATEST_WINDOWS.length - 1;
    expect(nextWindow({ window: 0, start: 1 }, continuation)).toEqual({ window: 1, start: 1 });
    expect(nextWindow({ window: last, start: 1 }, continuation)).toEqual({ window: last, start: 1, search: continuation });
    expect(nextWindow({ window: last, start: 1 }, null)).toBeNull();
    expect(windowNewest({ window: 0, start: 0 })).toBe(Infinity);
    expect(windowNewest({ window: 1, start: 86_400_000 })).toBe(0); // "this week" starts where "today" ended
  });
});

describe("Hacker News date windows", () => {
  it("pages inside a window, then opens an older window past Algolia's 1,000-hit limit", async () => {
    const { nextHnCursor } = await import("../src/sources/hackernews.js");
    const hits = [{ objectID: "1", created_at_i: 500 }, { objectID: "2", created_at_i: 300 }];
    expect(nextHnCursor({ page: 0, before: null }, { hits, nbPages: 5 }, 50)).toEqual({ page: 1, before: null });
    expect(nextHnCursor({ page: 19, before: null }, { hits, nbPages: 20 }, 50)).toEqual({ page: 0, before: 300 });
    expect(nextHnCursor({ page: 0, before: 300 }, { hits: [], nbPages: 0 }, 50)).toBeNull();
  });
});

describe("4chan archive posts", () => {
  it("links to the archived thread, strips reply links, and keeps only https thumbnails", async () => {
    const { parseArchivePost } = await import("../src/sources/fourchan.js");
    const item = parseArchivePost(
      { num: "12", thread_num: "10", title: null, comment: ">>11 One Piece is peak", timestamp: 1795687486, board: { shortname: "a" }, media: { thumb_link: "http://x/t.jpg" } },
      "desuarchive.org",
    );
    expect(item).toMatchObject({ title: "One Piece is peak", url: "https://desuarchive.org/a/thread/10/#12", author: "/a/", thumbnail: null });
    expect(parseArchivePost({ num: "1", comment: "no thread" }, "desuarchive.org")).toBeNull();
  });
});
