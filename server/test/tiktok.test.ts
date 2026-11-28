import { describe, expect, it, vi } from "vitest";

const { runOpenCli, runCli } = vi.hoisted(() => ({ runOpenCli: vi.fn(), runCli: vi.fn() }));
vi.mock("../src/sources/browser.js", () => ({ runOpenCli }));
vi.mock("../src/sources/http.js", () => ({ runCli }));

import { fetchTikTok, parsePlaylist, parseTikTokRow } from "../src/sources/tiktok.js";

const exploreRow = {
  id: "7709355914830138676",
  author: "bijoy_sadiya01",
  url: "https://www.tiktok.com/@bijoy_sadiya01/video/7709355914830138676",
  cover: "https://p16-sign.tiktokcdn.com/cover.jpg",
  desc: "a funny clip",
  plays: 4_500_000,
  likes: 170_900,
  comments: 4755,
  shares: 27_800,
  createTime: 1_794_974_307,
};

describe("tiktok rows", () => {
  it("builds a playable item with stats and date", () => {
    expect(parseTikTokRow(exploreRow)).toMatchObject({
      platform: "tiktok",
      title: "a funny clip",
      url: exploreRow.url,
      author: "bijoy_sadiya01",
      video: { kind: "tiktok", id: "7709355914830138676" },
      thumbnail: exploreRow.cover,
      metrics: { views: 4_500_000, score: 170_900, comments: 4755 },
    });
  });

  it("drops off-site urls and rows without a permalink, keeps photo posts as image cards", () => {
    expect(parseTikTokRow({ ...exploreRow, url: "https://www.tiktok.com/@user/photo/7709355914830138676" })).toMatchObject({
      video: null,
      thumbnail: exploreRow.cover,
    });
    expect(parseTikTokRow({ ...exploreRow, url: "https://example.com/video/1" })).toBeNull();
    expect(parseTikTokRow({ desc: "no url" })).toBeNull();
    expect(parseTikTokRow(null)).toBeNull();
  });

  it("falls back to a title when the description is empty", () => {
    expect(parseTikTokRow({ ...exploreRow, desc: "", title: "" })?.title).toBe("TikTok by bijoy_sadiya01");
  });
});

describe("yt-dlp playlist", () => {
  it("maps flat entries, keeping photo posts as image cards", () => {
    const stdout = JSON.stringify({
      entries: [
        { id: "7710449624397450509", url: "https://www.tiktok.com/@nasa/video/7710449624397450509", title: "Voyager", view_count: 169_800, like_count: 4256, thumbnails: [{ url: "https://p19-sign.tiktokcdn.com/t.jpg" }] },
        { id: "771", url: "https://www.tiktok.com/@nasa/photo/771", title: "a photo" },
        { url: "https://www.tiktok.com/@nasa/video/missing-id" },
      ],
    });
    const items = parsePlaylist(stdout, "nasa");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ author: "nasa", video: { kind: "tiktok", id: "7710449624397450509" }, metrics: { views: 169_800 } });
    expect(items[1]?.video).toBeNull(); // photo: thumbnail card
  });
});

describe("fetch", () => {
  it("reads the live trending page first through the shared browser", async () => {
    runOpenCli.mockResolvedValueOnce([exploreRow]);
    const page = await fetchTikTok(null);
    expect(runOpenCli).toHaveBeenCalledWith("tiktok", ["explore", "--limit", "30"], expect.any(Number));
    expect(page.items).toHaveLength(1);
    expect(page.next).toBe("0"); // deeper pages continue into the account list
  });

  it("reads a curated account through yt-dlp for deeper pages", async () => {
    runCli.mockResolvedValueOnce(JSON.stringify({ entries: [{ id: "771", url: "https://www.tiktok.com/@nasa/video/771", title: "Voyager" }] }));
    const page = await fetchTikTok("0");
    expect(runCli).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.stringContaining("@nasa")]), expect.any(Number));
    expect(page.items).toHaveLength(1);
    expect(page.next).toBe("1");
  });
});
