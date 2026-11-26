import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchText } from "../src/sources/http.js";

afterEach(() => vi.unstubAllGlobals());

describe("fetchText", () => {
  it("stops reading at maxBytes and returns the whole body without a cap", async () => {
    const body = "a".repeat(3000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    expect(await fetchText("https://example.com/big", 1000, 1024)).toBe("a".repeat(1024));
    expect(await fetchText("https://example.com/big")).toBe(body);
  });

  it("names the host on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(fetchText("https://example.com/x", 1000, 1024)).rejects.toThrow("HTTP 403 from example.com");
  });
});
