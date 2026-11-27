import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { fetchLemmy, resetLemmySearchBudget, searchLemmy } = await import("../src/sources/lemmy.js");

const post = { post: { id: 1, name: "rust news", nsfw: false, published: "2026-11-27T08:00:00Z" }, community: { name: "tech", nsfw: false }, counts: { score: 1, comments: 0 } };

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockResolvedValue({ posts: [post] });
  resetLemmySearchBudget();
  vi.useRealTimers();
});

describe("Lemmy page cap", () => {
  it("stops paging at page 100", async () => {
    expect((await fetchLemmy("99")).next).toBe("100");
    expect((await fetchLemmy("100")).next).toBeNull();
  });

  it("returns nothing past page 100 without asking", async () => {
    expect(await searchLemmy("rust", 100)).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    await searchLemmy("rust", 99);
    expect(fetchJson.mock.calls[0]?.[0]).toContain("page=100");
  });
});

describe("Lemmy search budget", () => {
  it("allows 9 searches per minute, then refuses until the window rolls", async () => {
    vi.useFakeTimers({ now: 0 });
    for (let i = 0; i < 9; i++) await searchLemmy("rust", 0);
    await expect(searchLemmy("rust", 0)).rejects.toThrow("Lemmy search limit reached; retrying soon");
    expect(fetchJson).toHaveBeenCalledTimes(9);
    vi.setSystemTime(60_000);
    await expect(searchLemmy("rust", 0)).resolves.toHaveLength(1);
  });
});
