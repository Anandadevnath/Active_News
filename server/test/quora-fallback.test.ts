import { describe, expect, it, vi } from "vitest";

vi.mock("../src/sources/reach.js", () => ({
  runReach: vi.fn(async () => [
    { platform: "quora", title: "What is happening in Gaza? - Quora", url: "https://www.quora.com/What-is-happening-in-Gaza", author: "", description: "", publishedAt: null, discussionUrl: null, video: null, thumbnail: null, metrics: {} },
    { platform: "quora", title: "Unrelated blog", url: "https://example.com/post", author: "", description: "", publishedAt: null, discussionUrl: null, video: null, thumbnail: null, metrics: {} },
  ]),
}));

const { viaWebSearch } = await import("../src/sources/quora.js");

describe("Quora web-search fallback", () => {
  it("keeps only quora.com links and strips the ' - Quora' title suffix", async () => {
    const items = await viaWebSearch();
    expect(items.map((i) => [i.title, i.url])).toEqual([["What is happening in Gaza?", "https://www.quora.com/What-is-happening-in-Gaza"]]);
  });
});
