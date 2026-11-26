import { beforeEach, describe, expect, it, vi } from "vitest";

const { runReach } = vi.hoisted(() => ({
  runReach: vi.fn(async (platform: string, args: readonly string[]) => [
    { platform, title: args.join(" "), url: `https://www.reddit.com/r/x/comments/${encodeURIComponent(args.join("-"))}`, author: "", description: "", publishedAt: null, discussionUrl: null, video: null, thumbnail: null, metrics: {} },
  ]),
}));
vi.mock("../src/sources/reach.js", () => ({ runReach }));
vi.mock("../src/sources/http.js", () => ({
  fetchJson: vi.fn(async () => {
    throw new Error("HTTP 403");
  }),
  runCli: vi.fn(async () => {
    throw new Error("blocked");
  }),
}));

const { fetchTwitter } = await import("../src/sources/twitter.js");
const { fetchQuora } = await import("../src/sources/quora.js");
const { INTERESTS } = await import("../src/sources/interests.js");
const TOPICS = INTERESTS.map((i) => i.query);

beforeEach(() => {
  runReach.mockClear();
});

describe("endless paging for sources without real cursors", () => {
  it("Twitter searches the next topic each page and wraps instead of ending", async () => {
    const first = await fetchTwitter(null);
    expect(runReach.mock.calls[0]![1]).toContain(TOPICS[0]);
    const wrapped = await fetchTwitter(String(TOPICS.length));
    expect(runReach.mock.calls[1]![1]).toContain(TOPICS[0]);
    expect(first.next).toBe("1");
    expect(wrapped.next).toBe(String(TOPICS.length + 1));
  });

  it("Quora deeper pages search a new topic and never return a null cursor", async () => {
    const first = await fetchQuora(null);
    expect(first.next).toBe("2");
    const deeper = await fetchQuora("3");
    expect(runReach.mock.calls.at(-1)![1].join(" ")).toContain(TOPICS[3]!);
    expect(deeper.next).toBe("4");
  });
});
