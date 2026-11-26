import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { parseOutletFeed } = await import("../src/sources/outlets.js");
const { fetchNews, resetNewsState } = await import("../src/sources/news.js");
const { INTERESTS } = await import("../src/sources/interests.js");

const RSS = `<?xml version="1.0"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
  <title>BBC News</title>
  <item>
    <title>Rice prices keep rising</title>
    <link>https://www.bbc.co.uk/news/articles/rice</link>
    <description><![CDATA[<p>Farmers say <b>costs</b> doubled.</p>]]></description>
    <pubDate>Thu, 26 Nov 2026 09:35:44 GMT</pubDate>
    <media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/rice.jpg"/>
  </item>
  <item>
    <title>Picture in the body</title>
    <link>https://example.com/body</link>
    <content:encoded><![CDATA[<img src="https://example.com/a.webp"> Text]]></content:encoded>
  </item>
  <item><title>Not https</title><link>http://example.com/plain</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>The Verge</title>
  <entry>
    <title>New phone</title>
    <link rel="alternate" href="https://www.theverge.com/phone"/>
    <published>2026-11-26T10:00:00Z</published>
    <summary>A new phone is out.</summary>
    <content type="html">&lt;img src="https://cdn.vox.com/phone.png"&gt;</content>
  </entry>
</feed>`;

beforeEach(() => {
  fetchJson.mockReset();
  fetchText.mockReset();
  resetNewsState();
});

describe("News sites (publisher feeds)", () => {
  it("reads RSS and Atom items with the outlet's domain, direct link, text and picture", () => {
    expect(parseOutletFeed(RSS)).toEqual([
      {
        platform: "news",
        title: "Rice prices keep rising",
        url: "https://www.bbc.co.uk/news/articles/rice",
        author: "bbc.co.uk",
        description: "Farmers say costs doubled.",
        publishedAt: "2026-11-26T09:35:44.000Z",
        discussionUrl: null,
        video: null,
        thumbnail: "https://ichef.bbci.co.uk/rice.jpg",
        metrics: {},
      },
      expect.objectContaining({ url: "https://example.com/body", thumbnail: "https://example.com/a.webp", publishedAt: null }),
    ]);
    expect(parseOutletFeed(ATOM)).toEqual([
      expect.objectContaining({
        title: "New phone",
        url: "https://www.theverge.com/phone",
        author: "theverge.com",
        description: "A new phone is out.",
        publishedAt: "2026-11-26T10:00:00.000Z",
        thumbnail: "https://cdn.vox.com/phone.png",
      }),
    ]);
  });

  it("pages through every interest's outlets first, then Google News a week at a time", async () => {
    fetchText.mockResolvedValue(RSS);
    const first = await fetchNews("0");
    expect(fetchText.mock.calls.map((c) => c[0])).toEqual(INTERESTS[0]!.feeds);
    expect(first.items.map((i) => i.author)).toContain("bbc.co.uk");
    expect(first.next).toBe("1");
    fetchText.mockClear();
    await fetchNews(String(INTERESTS.length));
    expect(fetchText.mock.calls[0]![0]).toMatch(/^https:\/\/news\.google\.com\/rss\/search\?q=news(%20|\+)after%3A/);
  });

  it("refreshes from the world-news outlets plus the next interest's, never Google News", async () => {
    fetchText.mockResolvedValue(RSS);
    const page = await fetchNews(null);
    const urls = fetchText.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual(expect.arrayContaining([...INTERESTS[0]!.feeds]));
    expect(urls.some((u) => u.includes("news.google.com"))).toBe(false);
    expect(page.next).toBe("0");
  });

  it("skips an outlet that fails while the others still show", async () => {
    fetchText.mockImplementation(async (url: string) => {
      if (url === INTERESTS[0]!.feeds[0]) throw new Error("HTTP 403 from www.bbc.co.uk");
      return RSS;
    });
    expect((await fetchNews("0")).items.length).toBeGreaterThan(0);
  });

  it("every interest has outlet feeds", () => {
    for (const interest of INTERESTS) expect(interest.feeds.length).toBeGreaterThan(0);
  });
});
