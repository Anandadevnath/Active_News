import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }));

const { searchHackerNews } = await import("../src/sources/hackernews.js");
const { parseNewsRss, RATE_LIMITED, resetNewsState, searchNews, weekPage } = await import("../src/sources/news.js");

const rss = (...titles: string[]) =>
  `<?xml version="1.0"?><rss><channel>${titles
    .map((t, i) => `<item><title>${t} - Reuters</title><link>https://news.google.com/rss/articles/${i}?oc=5</link><pubDate>Thu, 26 Nov 2026 09:35:44 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>`)
    .join("")}</channel></rss>`;

beforeEach(() => {
  fetchJson.mockReset();
  fetchText.mockReset();
  resetNewsState();
});

describe("Hacker News search", () => {
  it("searches a question's keywords, lets Algolia drop words from the end, and uses search_by_date for latest", async () => {
    fetchJson.mockResolvedValue({ hits: [], nbPages: 0 });
    await searchHackerNews("why is rice price rising", 0);
    const hot = new URL(fetchJson.mock.calls[0]![0] as string);
    expect(hot.pathname).toBe("/api/v1/search");
    expect(hot.searchParams.get("query")).toBe("rice price rising");
    expect(hot.searchParams.get("removeWordsIfNoResults")).toBe("lastWords");
    await searchHackerNews("why is rice price rising", 0, "latest");
    expect(new URL(fetchJson.mock.calls[1]![0] as string).pathname).toBe("/api/v1/search_by_date");
    await searchHackerNews("how to beat malenia", 0);
    expect(new URL(fetchJson.mock.calls[2]![0] as string).searchParams.get("removeWordsIfNoResults")).toBeNull();
    await searchHackerNews("how to make anime website", 0); // Algolia drops "make", not "website"
    expect(new URL(fetchJson.mock.calls[3]![0] as string).searchParams.get("query")).toBe("anime website make");
  });

  it("drops hits that kept fewer than two of the keywords", async () => {
    const hit = (id: string, title: string) => ({ objectID: id, title, created_at_i: 1 });
    fetchJson.mockResolvedValue({ hits: [hit("1", "Why are rice prices still high?"), hit("2", "Rising stars of 2026")], nbPages: 1 });
    expect((await searchHackerNews("rice price rising stars", 0)).map((i) => i.title)).toEqual(["Why are rice prices still high?"]);
  });

  it("drops Algolia's prefix matches for a one-word query", async () => {
    const hit = (id: string, title: string) => ({ objectID: id, title, created_at_i: 1 });
    fetchJson.mockResolvedValue({ hits: [hit("1", "Ladybird adopts Rust"), hit("2", "Ado tops the Oricon chart")], nbPages: 1 });
    expect((await searchHackerNews("ado", 0)).map((i) => i.title)).toEqual(["Ado tops the Oricon chart"]);
    fetchJson.mockResolvedValue({ hits: [hit("3", "LLMs are not enough"), hit("4", "Pokémon Go update")], nbPages: 1 });
    expect((await searchHackerNews("llm", 1)).map((i) => i.title)).toEqual(["LLMs are not enough"]);
    expect((await searchHackerNews("pokemon", 0)).map((i) => i.title)).toEqual(["Pokémon Go update"]);
  });
});

describe("News sites (Google News RSS)", () => {
  it("turns an RSS item into a story with the source as author", () => {
    expect(parseNewsRss(rss("Why are rice prices rising?"))).toEqual([
      {
        platform: "news",
        title: "Why are rice prices rising?",
        url: "https://news.google.com/rss/articles/0?oc=5",
        author: "Reuters",
        description: "",
        publishedAt: "2026-11-26T09:35:44.000Z",
        discussionUrl: null,
        video: null,
        thumbnail: null,
        metrics: {},
      },
    ]);
  });

  it("pages back one week at a time and skips empty weeks", async () => {
    fetchText.mockResolvedValueOnce(rss()).mockResolvedValueOnce(rss("Older story"));
    const page = await weekPage("one piece", 1);
    const queries = fetchText.mock.calls.map(([u]) => new URL(u as string).searchParams.get("q"));
    expect(queries).toHaveLength(2);
    expect(queries.every((q) => /^one piece after:\d{4}-\d{2}-\d{2} before:\d{4}-\d{2}-\d{2}$/.test(q!))).toBe(true);
    expect(page).toMatchObject({ next: 3, items: [{ title: "Older story" }] });
  }, 10_000); // two requests, 2 s apart

  it("asks for today's news first when sorting by latest", async () => {
    fetchText.mockResolvedValue(rss("One Piece episode 1150 review"));
    await searchNews("one piece", 0, "latest");
    expect(new URL(fetchText.mock.calls[0]![0] as string).searchParams.get("q")).toBe("one piece when:1d");
  }, 10_000);

  it("skips today's articles on later Latest pages, since page 0 (when:1d) already had them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z")); // fixture articles are from 09:35 that day
    try {
      fetchText.mockResolvedValue(rss("One Piece news"));
      expect(await searchNews("one piece", 0, "latest")).toHaveLength(1);
      expect(await searchNews("one piece", 1, "latest")).toHaveLength(0);
      expect(await searchNews("one piece", 1, "hot")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it("drops loosely related headlines that miss the query's keywords", async () => {
    fetchText.mockResolvedValue(rss("Best streaming websites to watch anime", "Crunchyroll Anime Awards 2026: your guide"));
    expect((await searchNews("how to make anime website", 0)).map((i) => i.title)).toEqual(["Best streaming websites to watch anime"]);
  }, 10_000);

  it("pauses after Google answers 429 and fails fast with a readable message", async () => {
    fetchText.mockRejectedValue(new Error("HTTP 429 from news.google.com"));
    await expect(searchNews("x", 0)).rejects.toThrow(RATE_LIMITED);
    await expect(searchNews("y", 0)).rejects.toThrow(RATE_LIMITED);
    expect(fetchText).toHaveBeenCalledTimes(1);
  }, 10_000);
});
