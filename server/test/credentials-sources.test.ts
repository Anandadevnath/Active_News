import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { redditApiGet } from "../src/sources/reddit-api.js";

afterEach(() => vi.unstubAllGlobals());

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
