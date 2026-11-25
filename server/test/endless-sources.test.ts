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
const { fetchReddit } = await import("../src/sources/reddit.js");
const { fetchQuora } = await import("../src/sources/quora.js");
const { TOPICS } = await import("../src/sources/topics.js");

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

  it("Reddit falls back to Agent Reach and keeps a reach cursor going", async () => {
    const first = await fetchReddit(null);
    expect(first.next).toBe("reach:2");
    const second = await fetchReddit(first.next);
    expect(second.next).toBe("reach:3");
    expect(second.items).toHaveLength(1);
  });

  it("Quora deeper pages search a new topic and never return a null cursor", async () => {
    const first = await fetchQuora(null);
    expect(first.next).toBe("2");
    const deeper = await fetchQuora("3");
    expect(runReach.mock.calls.at(-1)![1].join(" ")).toContain(`site:quora.com ${TOPICS[3]}`);
    expect(deeper.next).toBe("4");
  });
});
