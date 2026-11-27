import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { fetchMastodon, parseMastoStatus, searchMastodon } = await import("../src/sources/mastodon.js");
const { fetchLemmy, parseLemmyPost, searchLemmy } = await import("../src/sources/lemmy.js");

const status = (id: string, html: string, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: "2026-11-27T08:00:00.000Z",
  sensitive: false,
  spoiler_text: "",
  url: `https://mastodon.social/@bob/${id}`,
  uri: `https://mastodon.social/users/bob/statuses/${id}`,
  content: html,
  account: { acct: "bob", display_name: "Bob" },
  media_attachments: [],
  card: null,
  replies_count: 2,
  favourites_count: 40,
  ...extra,
});

const lemmyPost = (id: number, name: string, extra: Record<string, unknown> = {}, community: Record<string, unknown> = {}) => ({
  post: { id, name, nsfw: false, published: "2026-11-27T08:50:39.675261Z", ...extra },
  community: { name: "technology", nsfw: false, ...community },
  counts: { score: 22, comments: 5 },
});

beforeEach(() => {
  fetchJson.mockReset();
  fetchText.mockReset();
});

describe("Mastodon", () => {
  it("turns a post into a story: text without HTML, picture, video clip, stats", () => {
    expect(
      parseMastoStatus(status("1", "<p>One Piece &amp; friends</p>", { media_attachments: [{ type: "image", preview_url: "https://files.mastodon.social/p.jpg" }] })),
    ).toEqual({
      platform: "mastodon",
      title: "One Piece & friends",
      url: "https://mastodon.social/@bob/1",
      author: "Bob",
      description: "",
      publishedAt: "2026-11-27T08:00:00.000Z",
      discussionUrl: "https://mastodon.social/@bob/1",
      video: null,
      thumbnail: "https://files.mastodon.social/p.jpg",
      metrics: { score: 40, comments: 2 },
    });
    const clip = parseMastoStatus(status("2", "<p>clip</p>", { media_attachments: [{ type: "video", url: "https://files.mastodon.social/v.mp4", preview_url: "https://files.mastodon.social/v.jpg" }] }))!;
    expect(clip.video).toEqual({ kind: "file", url: "https://files.mastodon.social/v.mp4" });
  });

  it("drops sensitive posts and posts behind a content warning", () => {
    expect(parseMastoStatus(status("3", "<p>x</p>", { sensitive: true }))).toBeNull();
    expect(parseMastoStatus(status("4", "<p>x</p>", { spoiler_text: "spoilers" }))).toBeNull();
  });

  it("searches the query's hashtags, keeps posts with its words, and pages back by id", async () => {
    fetchJson.mockResolvedValueOnce([status("10", "<p>One Piece chapter out</p>"), status("9", "<p>a piece of cake</p>")]);
    fetchJson.mockResolvedValueOnce([]);
    expect((await searchMastodon("one piece", 0)).map((i) => i.title)).toEqual(["One Piece chapter out"]);
    const url = new URL(fetchJson.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/api/v1/timelines/tag/onepiece");
    expect(url.searchParams.getAll("any[]")).toEqual(["one", "piece"]);
    await searchMastodon("one piece", 1);
    expect(new URL(fetchJson.mock.calls[1]![0] as string).searchParams.get("max_id")).toBe("9");
  });

  it("refreshes from trending posts plus one interest's hashtags, then pages trends, then interests", async () => {
    fetchJson.mockImplementation(async (url: string) => (url.includes("/trends/") ? [status("t", "<p>trending</p>")] : [status("h", "<p>tagged</p>")]));
    const first = await fetchMastodon(null);
    expect(first.items.map((i) => i.title).sort()).toEqual(["tagged", "trending"]);
    expect(first.next).toBe("1");
    fetchJson.mockClear();
    fetchJson.mockResolvedValueOnce([]); // trends ran out
    fetchJson.mockResolvedValueOnce([status("h2", "<p>news</p>")]);
    const deeper = await fetchMastodon("2");
    expect(fetchJson.mock.calls[1]![0]).toContain("/timelines/tag/");
    expect(deeper.items).toHaveLength(1);
  });
});

describe("Lemmy", () => {
  it("links an article post to the article, a picture post to its discussion, and drops NSFW", () => {
    const article = parseLemmyPost(lemmyPost(1, "New chip", { url: "https://example.com/chip", thumbnail_url: "https://lemmy.world/pictrs/t.jpg" }))!;
    expect(article).toMatchObject({ platform: "lemmy", url: "https://example.com/chip", discussionUrl: "https://lemmy.world/post/1", author: "c/technology", thumbnail: "https://lemmy.world/pictrs/t.jpg", publishedAt: "2026-11-27T08:50:39.675Z", metrics: { score: 22, comments: 5 } });
    const picture = parseLemmyPost(lemmyPost(2, "My cat", { url: "https://lemmy.world/pictrs/cat.jpeg", url_content_type: "image/jpeg" }))!;
    expect(picture.url).toBe("https://lemmy.world/post/2");
    expect(picture.thumbnail).toBe("https://lemmy.world/pictrs/cat.jpeg");
    expect(parseLemmyPost(lemmyPost(3, "x", { nsfw: true }))).toBeNull();
    expect(parseLemmyPost(lemmyPost(4, "x", {}, { nsfw: true }))).toBeNull();
  });

  it("pages the Hot list and ends when Lemmy has nothing more", async () => {
    fetchJson.mockResolvedValueOnce({ posts: [lemmyPost(1, "a")] });
    expect(await fetchLemmy(null)).toMatchObject({ next: "2" });
    expect(fetchJson.mock.calls[0]![0]).toContain("page=1");
    fetchJson.mockResolvedValueOnce({ posts: [] });
    expect((await fetchLemmy("2")).next).toBeNull();
  });

  it("searches keywords, newest first for latest, and re-checks Lemmy's loose matches", async () => {
    fetchJson.mockResolvedValue({ posts: [lemmyPost(1, "Rice prices keep rising"), lemmyPost(2, "One thing about health")] });
    expect((await searchLemmy("why is rice price rising", 0, "latest")).map((i) => i.title)).toEqual(["Rice prices keep rising"]);
    const url = new URL(fetchJson.mock.calls[0]![0] as string);
    expect(url.searchParams.get("q")).toBe("rice price rising");
    expect(url.searchParams.get("sort")).toBe("New");
    expect(url.searchParams.get("page")).toBe("1");
  });
});
