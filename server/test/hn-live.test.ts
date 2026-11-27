import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { freshIds, watchHackerNews } = await import("../src/sources/hackernews.js");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchJson.mockReset();
});

/** A server-sent event stream that sends each chunk, then stays open. */
function sse(...chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(new TextEncoder().encode(c)));
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("Hacker News live stream", () => {
  it("finds the ids a list gained", () => {
    expect(freshIds(new Set([1, 2]), [4, 3, 1, 2])).toEqual([4, 3]);
  });

  it("pushes only stories that are new after the first list, the moment the stream reports a change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse('event: put\ndata: {"path":"/","data":[2,1]}\n\n', "event: keep-alive\ndata: null\n\n", 'event: patch\ndata: {"path":"/","data":{"0":3}}\n\n')));
    fetchJson.mockImplementation(async (url: string) => {
      if (url.endsWith("/newstories.json")) return fetchJson.mock.calls.filter((c) => (c[0] as string).endsWith("/newstories.json")).length === 1 ? [2, 1] : [3, 2, 1];
      return { id: 3, type: "story", title: "Show HN: live", by: "pg", time: 1_795_000_000, text: "hello" };
    });
    const pushed: string[][] = [];
    const stop = watchHackerNews((items) => pushed.push(items.map((i) => i.title)));
    await vi.waitFor(() => expect(pushed).toEqual([["Show HN: live"]]));
    stop();
  });

  it("retries a new story whose item fetch failed on the next change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse('event: put\ndata: {}\n\n', 'event: patch\ndata: {}\n\n', 'event: patch\ndata: {}\n\n')));
    let listCalls = 0;
    let itemCalls = 0;
    fetchJson.mockImplementation(async (url: string) => {
      if (url.endsWith("/newstories.json")) return ++listCalls === 1 ? [1] : [2, 1];
      return ++itemCalls === 1 ? null : { id: 2, type: "story", title: "Late item", by: "pg", time: 1_795_000_000, text: "hi" };
    });
    const pushed: string[][] = [];
    const stop = watchHackerNews((items) => items.length && pushed.push(items.map((i) => i.title)));
    await vi.waitFor(() => expect(pushed).toEqual([["Late item"]]));
    stop();
  });

  it("reconnects when the stream goes silent past the idle timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // like undici, error the body when the request is aborted
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          init.signal?.addEventListener("abort", () => c.error(new Error("aborted")));
        },
      });
      return new Response(body);
    });
    vi.stubGlobal("fetch", fetchMock);
    const stop = watchHackerNews(() => {});
    await vi.advanceTimersByTimeAsync(74_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 + 10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });
});
