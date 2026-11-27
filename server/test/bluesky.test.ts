import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { fetchBluesky, parseBskyPost, searchBluesky } = await import("../src/sources/bluesky.js");

const post = (rkey: string, text: string, extra: Record<string, unknown> = {}) => ({
  uri: `at://did:plc:abc/app.bsky.feed.post/${rkey}`,
  author: { did: "did:plc:abc", handle: "alice.bsky.social", displayName: "Alice", labels: [] },
  record: { text, createdAt: "2026-11-26T10:00:00.000Z" },
  indexedAt: "2026-11-26T10:00:01.000Z",
  likeCount: 12,
  replyCount: 3,
  labels: [],
  ...extra,
});

beforeEach(() => {
  fetchJson.mockReset();
  fetchText.mockReset();
});

describe("Bluesky", () => {
  it("turns a post into a story with its link, picture, stats and time", () => {
    expect(parseBskyPost(post("p1", "One Piece chapter is out", { embed: { $type: "app.bsky.embed.images#view", images: [{ thumb: "https://cdn.bsky.app/img/t.jpg" }] } }))).toEqual({
      platform: "bluesky",
      title: "One Piece chapter is out",
      url: "https://bsky.app/profile/did:plc:abc/post/p1",
      author: "Alice",
      description: "",
      publishedAt: "2026-11-26T10:00:00.000Z",
      discussionUrl: "https://bsky.app/profile/did:plc:abc/post/p1",
      video: null,
      thumbnail: "https://cdn.bsky.app/img/t.jpg",
      metrics: { score: 12, comments: 3 },
    });
  });

  it("points a shared link at the article (a YouTube link plays) and keeps the post as the discussion", () => {
    const item = parseBskyPost(
      post("p2", "watch this", { embed: { $type: "app.bsky.embed.external#view", external: { uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "A video", thumb: "https://cdn.bsky.app/img/y.jpg" } } }),
    )!;
    expect(item.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(item.discussionUrl).toBe("https://bsky.app/profile/did:plc:abc/post/p2");
    expect(item.video).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
    expect(item.description).toBe("A video");
  });

  it("keeps two posts sharing one GIF apart: the GIF is their picture, the post their link", () => {
    const gif = (rkey: string) =>
      parseBskyPost(post(rkey, "lol", { embed: { $type: "app.bsky.embed.external#view", external: { uri: "https://static.klipy.com/ii/x.gif", title: "Funny", thumb: "https://cdn.bsky.app/img/g.jpg" } } }))!;
    expect(gif("g1").url).toBe("https://bsky.app/profile/did:plc:abc/post/g1");
    expect(gif("g2").url).not.toBe(gif("g1").url);
    expect(gif("g1").thumbnail).toBe("https://cdn.bsky.app/img/g.jpg");
    expect(gif("g1").description).toBe("");
  });

  it("shows a long post's full text below its shortened title", () => {
    const long = "word ".repeat(60).trim();
    const item = parseBskyPost(post("p7", long))!;
    expect(item.title.length).toBeLessThanOrEqual(140);
    expect(item.description.length).toBeGreaterThan(item.title.length);
  });

  it("drops posts quoting adult posts or from authors hidden from logged-out readers, and links by DID", () => {
    expect(parseBskyPost(post("q1", "x", { embed: { $type: "app.bsky.embed.record#view", record: { labels: [{ val: "porn" }] } } }))).toBeNull();
    expect(parseBskyPost(post("q2", "x", { author: { handle: "a.b", labels: [{ val: "!no-unauthenticated" }] } }))).toBeNull();
    expect(parseBskyPost(post("q3", "x", { labels: [{ val: "sexual-figurative" }] }))).toBeNull();
    const item = parseBskyPost(post("q4", "hi", { author: { handle: "handle.invalid", labels: [] } }))!;
    expect(item.discussionUrl).toBe("https://bsky.app/profile/did:plc:abc/post/q4");
    expect(item.author).toBe("");
  });

  it("reads one page of top posts for hot search, since paging by date would skip most of them", async () => {
    fetchJson.mockResolvedValue({ posts: [post("t1", "one piece art")] });
    expect(await searchBluesky("one piece", 0, "hot")).toHaveLength(1);
    expect(await searchBluesky("one piece", 1, "hot")).toEqual([]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("drops adult-labelled posts and posts with nothing to show, and never trusts a future date", () => {
    expect(parseBskyPost(post("p3", "x", { labels: [{ val: "porn" }] }))).toBeNull();
    expect(parseBskyPost(post("p4", "x", { record: { text: "x", labels: { values: [{ val: "nudity" }] } } }))).toBeNull();
    expect(parseBskyPost(post("p5", "  "))).toBeNull();
    const future = parseBskyPost(post("p6", "hello", { record: { text: "hello", createdAt: "2099-01-01T00:00:00Z" } }))!;
    expect(future.publishedAt).toBe("2026-11-26T10:00:01.000Z");
  });

  it("searches the query's keywords and pages back by date, since the search cursor needs a login", async () => {
    fetchJson.mockResolvedValueOnce({ posts: [post("a", "rice prices rising", { indexedAt: "2026-11-26T10:00:00.000Z" }), post("b", "rice price keeps rising", { indexedAt: "2026-11-26T09:00:00.000Z" })] });
    fetchJson.mockResolvedValueOnce({ posts: [] });
    expect(await searchBluesky("why is rice price rising", 0, "latest")).toHaveLength(2);
    const first = new URL(fetchJson.mock.calls[0]![0] as string);
    expect(first.hostname).toBe("api.bsky.app");
    expect(first.searchParams.get("q")).toBe("rice price rising");
    expect(first.searchParams.get("sort")).toBe("latest");
    expect(first.searchParams.get("until")).toBeNull();
    await searchBluesky("why is rice price rising", 1, "latest");
    expect(new URL(fetchJson.mock.calls[1]![0] as string).searchParams.get("until")).toBe("2026-11-26T09:00:00.000Z");
  });

  it("refreshes from What's Hot plus one interest, and pages deeper through What's Hot", async () => {
    fetchJson.mockImplementation(async (url: string) =>
      url.includes("getFeed") ? { feed: [{ post: post("h1", "hot post") }], cursor: "c2" } : { posts: [post("s1", "gaming news")] },
    );
    const first = await fetchBluesky(null);
    expect(first.items.map((i) => i.title).sort()).toEqual(["gaming news", "hot post"]);
    expect(first.next).toBe("c2");
    fetchJson.mockClear();
    const deeper = await fetchBluesky("c2");
    expect(new URL(fetchJson.mock.calls[0]![0] as string).searchParams.get("cursor")).toBe("c2");
    expect(deeper.next).toBe("c2");
  });
});
