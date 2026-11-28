import { describe, expect, it, vi } from "vitest";

const { runReach } = vi.hoisted(() => ({ runReach: vi.fn() }));
vi.mock("../src/sources/reach.js", () => ({ runReach }));

import { fetchFacebook, searchFacebook } from "../src/sources/facebook.js";
import type { RawItem } from "../src/types.js";

const reachItem = (url: string, title = url): RawItem => ({
  platform: "facebook",
  title,
  url,
  author: "",
  description: "",
  publishedAt: null,
  discussionUrl: null,
  video: null,
  thumbnail: null,
  metrics: {},
});

describe("facebook fetch", () => {
  it("keeps post-shaped results and drops page/profile/group hits", async () => {
    runReach.mockResolvedValueOnce([
      reachItem("https://www.facebook.com/NASA"),
      reachItem("https://www.facebook.com/groups/123/", "a group"),
      reachItem("https://www.facebook.com/NASA/posts/123", "a post"),
      reachItem("https://www.facebook.com/watch/?v=456", "a video"),
      reachItem("https://www.facebook.com/permalink.php?story_fbid=1&id=2", "a permalink"),
    ]);
    const page = await fetchFacebook(null);
    expect(runReach).toHaveBeenCalledWith("facebook", ["facebook", "search", expect.any(String), "--limit", "20"]);
    expect(page.items.map((i) => i.url)).toEqual([
      "https://www.facebook.com/NASA/posts/123",
      "https://www.facebook.com/watch/?v=456",
      "https://www.facebook.com/permalink.php?story_fbid=1&id=2",
    ]);
    expect(page.next).toBe("1");
  });

  it("searches the next interest for deeper pages", async () => {
    runReach.mockResolvedValueOnce([]);
    await fetchFacebook("2");
    expect(runReach).toHaveBeenLastCalledWith("facebook", ["facebook", "search", "artificial intelligence", "--limit", "20"]);
  });
});

describe("facebook search", () => {
  it("answers page 0 live and leaves later pages to the pool", async () => {
    runReach.mockResolvedValueOnce([reachItem("https://www.facebook.com/NASA/posts/123", "one piece fan post")]);
    const items = await searchFacebook("one piece", 0);
    expect(items.map((i) => i.title)).toEqual(["one piece fan post"]);
    expect(await searchFacebook("one piece", 1)).toEqual([]);
    expect(runReach).toHaveBeenCalledTimes(1);
  });
});
