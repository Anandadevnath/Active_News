import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { parseMastoStatus, searchMastodon } = await import("../src/sources/mastodon.js");

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
  tags: [],
  ...extra,
});

beforeEach(() => {
  fetchJson.mockReset();
  fetchText.mockReset();
});

describe("Mastodon fixes", () => {
  it("retries an unused joined tag with the first keyword and keeps paging that timeline", async () => {
    fetchJson
      .mockResolvedValueOnce([]) // #ricepricerising was never used
      .mockResolvedValueOnce([status("9", "<p>rice price rising again</p>")])
      .mockResolvedValueOnce([status("8", "<p>rice price rising more</p>")]);
    const first = await searchMastodon("rice price rising fallback", 0);
    expect(first.map((i) => i.title)).toEqual(["rice price rising again"]);
    const retry = new URL(fetchJson.mock.calls[1]![0] as string);
    expect(retry.pathname).toBe("/api/v1/timelines/tag/rice");
    expect(retry.searchParams.getAll("any[]")).toEqual(["ricepricerisingfallback", "price", "rising", "fallback"]);

    const second = await searchMastodon("rice price rising fallback", 1);
    expect(second.map((i) => i.title)).toEqual(["rice price rising more"]);
    const next = new URL(fetchJson.mock.calls[2]![0] as string);
    expect(next.pathname).toBe("/api/v1/timelines/tag/rice");
    expect(next.searchParams.get("max_id")).toBe("9");
  });

  it("stops search at page 10 without requests", async () => {
    expect(await searchMastodon("one piece", 10)).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("drops posts and reblogs with adult hashtags", () => {
    expect(parseMastoStatus(status("1", "<p>x</p>", { tags: [{ name: "NSFW" }] }))).toBeNull();
    expect(parseMastoStatus(status("2", "<p>x</p>", { reblog: status("3", "<p>y</p>", { tags: [{ name: "r18" }] }) }))).toBeNull();
    expect(parseMastoStatus(status("4", "<p>x</p>", { tags: [{ name: "art" }] }))).not.toBeNull();
  });
});
