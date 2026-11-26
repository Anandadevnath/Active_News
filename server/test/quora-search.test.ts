import { describe, expect, it, vi } from "vitest";

const { runReach } = vi.hoisted(() => ({
  runReach: vi.fn(async (_platform: string, args: readonly string[]) => {
    const q = args[2] ?? "";
    // every variant returns one shared question plus one of its own
    return [
      { platform: "quora", title: "Shared", url: "https://www.quora.com/shared", author: "", description: "", publishedAt: null, discussionUrl: null, video: null, thumbnail: null, metrics: {} },
      { platform: "quora", title: q, url: `https://www.quora.com/${encodeURIComponent(q)}`, author: "", description: "", publishedAt: null, discussionUrl: null, video: null, thumbnail: null, metrics: {} },
    ];
  }),
}));
vi.mock("../src/sources/reach.js", () => ({ runReach }));

const { searchQuora, SEARCH_VARIANTS } = await import("../src/sources/quora.js");

describe("Quora search variants", () => {
  it("uses a new phrasing each page and never repeats a question", async () => {
    const p0 = await searchQuora("dune", 0);
    const p1 = await searchQuora("dune", 1);
    expect(p0.map((i) => i.title)).toEqual(["Shared", "site:quora.com Quora discussion about dune"]);
    expect(p1.map((i) => i.title)).toEqual(["site:quora.com dune questions on Quora"]);
    expect(await searchQuora("dune", SEARCH_VARIANTS.length)).toEqual([]);
  });
});
