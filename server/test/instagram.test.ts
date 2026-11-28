import { describe, expect, it, vi } from "vitest";

const { runOpenCli } = vi.hoisted(() => ({ runOpenCli: vi.fn() }));
vi.mock("../src/sources/browser.js", () => ({ runOpenCli }));

import { fetchInstagram, parseInstagramRow } from "../src/sources/instagram.js";
import { INSTAGRAM_ACCOUNTS } from "../src/sources/interests.js";

const post = {
  url: "https://www.instagram.com/p/CxABc123xyz/",
  caption: "hello world",
  cover: "https://cdninstagram.com/cover.jpg",
  video: "https://cdninstagram.com/v.mp4",
  likes: 42,
  comments: 3,
  views: 900,
  taken: "2025-11-28T03:20:00.000Z",
};

describe("instagram rows", () => {
  it("builds an item with the mp4 as its video and the cover as its thumbnail", () => {
    expect(parseInstagramRow(post, "nasa")).toMatchObject({
      platform: "instagram",
      title: "hello world",
      author: "nasa",
      video: { kind: "file", url: post.video },
      thumbnail: post.cover,
      publishedAt: "2025-11-28T03:20:00.000Z",
      metrics: { score: 42, comments: 3, views: 900 },
    });
  });

  it("drops rows without a permalink and non-https media", () => {
    expect(parseInstagramRow({ caption: "no url" }, "nasa")).toBeNull();
    expect(parseInstagramRow({ ...post, url: "http://www.instagram.com/p/x/" }, "nasa")).toBeNull();
    expect(parseInstagramRow({ ...post, video: "http://cdn/x.mp4" }, "nasa")?.video).toBeNull();
    expect(parseInstagramRow({ ...post, taken: "not a date" }, "nasa")?.publishedAt).toBeNull();
  });

  it("falls back to an account title when the caption is empty", () => {
    expect(parseInstagramRow({ ...post, caption: "" }, "nasa")?.title).toBe("nasa on Instagram");
  });
});

describe("fetch", () => {
  it("reads one curated account per fetch and pages deeper down the list", async () => {
    runOpenCli.mockResolvedValue([post]);
    const first = await fetchInstagram(null);
    expect(runOpenCli).toHaveBeenCalledWith("instagram", ["user", expect.any(String), "--limit", "12"], expect.any(Number));
    const account = (runOpenCli.mock.calls[0]![1] as string[])[1]!;
    expect(INSTAGRAM_ACCOUNTS).toContain(account);
    expect(first.items).toHaveLength(1);
    expect(first.next).toBe("1");

    await fetchInstagram("1");
    expect(runOpenCli).toHaveBeenLastCalledWith("instagram", ["user", INSTAGRAM_ACCOUNTS[1]!, "--limit", "12"], expect.any(Number));
  });
});
