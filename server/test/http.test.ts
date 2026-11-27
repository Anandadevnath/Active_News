import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPublicText, fetchText, isPrivateIp } from "../src/sources/http.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const mockLookup = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;
const resolveTo = (map: Record<string, string>) =>
  mockLookup.mockImplementation(async (host: string) => [{ address: map[host] ?? "93.184.216.34", family: 4 }]);

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

describe("fetchPublicText", () => {
  it("fetches a public https page and follows a public redirect", async () => {
    resolveTo({});
    const fetchMock = vi.fn(async (u: URL) =>
      u.pathname === "/a" ? new Response(null, { status: 301, headers: { location: "/b" } }) : new Response("a".repeat(3000)),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPublicText("https://example.com/a", 1000, 1024)).toBe("a".repeat(1024));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect to loopback before requesting it", async () => {
    resolveTo({});
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicText("https://example.com/x", 1000)).rejects.toThrow("non-https");
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/admin" } }));
    await expect(fetchPublicText("https://example.com/x", 1000)).rejects.toThrow("private address");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a host that resolves to a private address", async () => {
    resolveTo({ "evil.example": "10.0.0.1" });
    const fetchMock = vi.fn(async () => new Response("secret"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicText("https://evil.example/", 1000)).rejects.toThrow("private address");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after 5 redirect hops", async () => {
    resolveTo({});
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicText("https://example.com/loop", 1000)).rejects.toThrow("too many redirects");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1"])(
    "refuses %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});
