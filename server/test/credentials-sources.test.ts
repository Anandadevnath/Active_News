import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { parseExaResults } from "../src/sources/exa.js";
import { redditApiGet } from "../src/sources/reddit-api.js";

afterEach(() => vi.unstubAllGlobals());

describe("Exa results", () => {
  it("keeps titled results and maps them to stories", () => {
    const items = parseExaResults(
      [
        { title: "Why did X happen?", url: "https://www.quora.com/Why", publishedDate: "2026-11-25T00:00:00Z", text: "Because." },
        { title: null, url: "https://www.quora.com/untitled" },
      ],
      "quora",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ platform: "quora", title: "Why did X happen?", description: "Because.", publishedAt: "2026-11-25T00:00:00Z" });
  });
});

describe("Reddit official API", () => {
  it("gets an app-only token once and sends it as a bearer", async () => {
    Object.assign(config, { redditClientId: "id", redditClientSecret: "secret" });
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("access_token")
        ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }))
        : new Response(JSON.stringify({ data: { children: [] } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await redditApiGet("/r/news/hot");
    await redditApiGet("/r/news/hot?after=x");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.filter(([u]) => u.includes("access_token"))).toHaveLength(1);
    expect(calls[1]![0]).toBe("https://oauth.reddit.com/r/news/hot");
    expect((calls[1]![1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});
