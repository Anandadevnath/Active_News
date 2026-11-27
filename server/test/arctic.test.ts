import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchJson } = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("../src/sources/http.js", () => ({
  fetchJson,
  fetchText: vi.fn(async () => {
    throw new Error("offline");
  }),
}));

const { arcticRefresh, arcticSearchPage, arcticStep, classifySubreddits, groupPage, ARCTIC_CURSOR } = await import("../src/sources/arctic.js");
const { INTERESTS } = await import("../src/sources/interests.js");
const { QueryPager } = await import("../src/sources/pager.js");

const post = (id: string, created: number, extra: Record<string, unknown> = {}) => ({
  title: `post ${id}`,
  permalink: `/r/x/comments/${id}/p/`,
  url: `https://www.reddit.com/r/x/comments/${id}/p/`,
  created_utc: created,
  ...extra,
});

beforeEach(() => {
  fetchJson.mockReset();
});

describe("Arctic Shift feed", () => {
  it("pages back from the newest of the per-sub oldest posts and drops NSFW posts", async () => {
    fetchJson.mockImplementation(async (url: string) => {
      const sub = new URL(url).searchParams.get("subreddit");
      // sub "a" fills its page (10 posts, oldest 91), sub "b" returns 2 posts and is done
      const data =
        sub === "a"
          ? Array.from({ length: 10 }, (_, i) => post(`a${i}`, 100 - i))
          : [post("b0", 50), post("b1", 40, { over_18: true })];
      return { data };
    });
    const page = await groupPage(["a", "b"]);
    expect(page.next).toBe(91);
    expect(page.items).toHaveLength(11);
    await groupPage(["a"], page.next!);
    expect(new URL(fetchJson.mock.calls.at(-1)![0] as string).searchParams.get("before")).toBe("91");
  });

  it("refreshes the next interests in turn, and step cursors walk every interest", async () => {
    fetchJson.mockImplementation(async (url: string) => ({ data: [post(`${new URL(url).searchParams.get("subreddit")}-1`, 100)] }));
    const subsOf = (from: number) => fetchJson.mock.calls.slice(from).map(([u]) => new URL(u as string).searchParams.get("subreddit"));
    const first = await arcticRefresh();
    expect(subsOf(0)).toEqual(INTERESTS.slice(0, 3).flatMap((i) => i.subreddits));
    expect(first.next).toBe(`${ARCTIC_CURSOR}0`);
    const calls = fetchJson.mock.calls.length;
    await arcticRefresh();
    expect(subsOf(calls)).toEqual(INTERESTS.slice(3, 6).flatMap((i) => i.subreddits));
    const before = fetchJson.mock.calls.length;
    const step = await arcticStep(`${ARCTIC_CURSOR}1`);
    expect(subsOf(before)).toEqual([...INTERESTS[1]!.subreddits]);
    expect(step.next).toBe(`${ARCTIC_CURSOR}2`);
  });
});

describe("Reddit subreddit discovery", () => {
  const match = (id: string, subreddit: string) => post(id, 50, { title: `Rice prices rising ${id}`, subreddit });

  it("keeps a full-name subreddit whole, a discussed short name whole, and the rest filtered", () => {
    expect(classifySubreddits({ full: ["OnePiece"], partial: [] }, [])).toEqual({ whole: ["OnePiece"], filtered: [] });
    const pp = [match("1", "worldnews"), match("2", "worldnews"), match("3", "worldnews"), match("4", "Rice"), match("5", "japan")];
    expect(classifySubreddits({ full: [], partial: ["Rice"] }, pp)).toEqual({ whole: ["Rice"], filtered: ["worldnews"] });
    expect(classifySubreddits({ full: [], partial: ["Rice"] }, pp.slice(0, 3))).toEqual({ whole: [], filtered: ["Rice", "worldnews"] });
  });

  it("reads only matching posts from subreddits that just share a word with the query", async () => {
    fetchJson.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (url.includes("subreddits/search")) return { data: u.searchParams.get("subreddit_prefix") === "rice" ? [{ display_name: "Rice", subscribers: 90_000 }] : [] };
      if (url.includes("pullpush")) return { data: [match("1", "worldnews"), match("2", "worldnews"), match("3", "worldnews")] };
      const sub = u.searchParams.get("subreddit");
      return { data: [post(`${sub}-campus`, 80, { title: "Campus parking", subreddit: sub }), post(`${sub}-rice`, 70, { title: "Rice price rising again", subreddit: sub })] };
    });
    const page = await arcticSearchPage("why is rice price rising", undefined);
    expect(fetchJson.mock.calls.map(([u]) => new URL(u as string).searchParams.get("subreddit")).filter(Boolean).sort()).toEqual(["Rice", "worldnews"]);
    expect(page.items.map((i) => i.title).sort()).toEqual(["Rice price rising again", "Rice price rising again", "Rice prices rising 1", "Rice prices rising 2", "Rice prices rising 3"]);
  });
});

describe("Arctic Shift search", () => {
  it("uses work-safe topic subreddits, keeps whole-phrase PullPush titles, and stops when both run out", async () => {
    fetchJson.mockImplementation(async (url: string) => {
      if (url.includes("subreddits/search")) {
        return {
          data: [
            { display_name: "OnePiece", subscribers: 5_000_000 },
            { display_name: "onepiecensfw", subscribers: 400_000, over18: true },
            { display_name: "onepiecetiny", subscribers: 10 },
          ],
        };
      }
      if (url.includes("pullpush")) {
        return { data: [post("p1", 30, { title: "One Piece chapter 1200" }), post("p2", 20, { title: "one big piece of cake" })] };
      }
      return { data: [post("o1", 90)] };
    });
    const page = await arcticSearchPage("one piece", undefined);
    const subsQueried = fetchJson.mock.calls.map(([u]) => new URL(u as string).searchParams.get("subreddit")).filter(Boolean);
    expect(subsQueried).toEqual(["OnePiece"]);
    expect(page.items.map((i) => i.title)).toEqual(["post o1", "One Piece chapter 1200"]);
    expect(page.next).toBeNull();
  });
});

describe("Reddit one-word search", () => {
  it("takes only r/<word> whole, not bigger subreddits that merely start with it", async () => {
    fetchJson.mockImplementation(async (url: string) => {
      if (url.includes("subreddits/search")) {
        return { data: [{ display_name: "AdoptMeRBX", subscribers: 900_000 }, { display_name: "Adobe", subscribers: 800_000 }, { display_name: "AdorableArt", subscribers: 700_000 }, { display_name: "ADO", subscribers: 93_000 }] };
      }
      if (url.includes("pullpush")) return { data: [] };
      return { data: [post("a1", 90, { title: "Ado announces a new single" })] };
    });
    await arcticSearchPage("ado", undefined);
    const subsQueried = fetchJson.mock.calls.map(([u]) => new URL(u as string).searchParams.get("subreddit")).filter(Boolean);
    expect(subsQueried).toEqual(["ADO"]);
  });

  it("accepts the plural name: 'movie' reads r/movies", async () => {
    fetchJson.mockImplementation(async (url: string) => {
      if (url.includes("subreddits/search")) return { data: [{ display_name: "movies", subscribers: 37_000_000 }, { display_name: "MovieSuggestions", subscribers: 2_000_000 }] };
      if (url.includes("pullpush")) return { data: [] };
      return { data: [post("m1", 90, { title: "Best movie of the year" })] };
    });
    await arcticSearchPage("movie", undefined);
    expect(fetchJson.mock.calls.map(([u]) => new URL(u as string).searchParams.get("subreddit")).filter(Boolean)).toEqual(["movies"]);
  });
});

describe("QueryPager", () => {
  it("continues page N from page N-1's cursor and returns nothing past the end", async () => {
    const pager = new QueryPager<number>();
    const seen: (number | undefined)[] = [];
    const fetchPage = async (c: number | undefined) => {
      seen.push(c);
      const n = c ?? 0;
      return { items: [], next: n < 2 ? n + 1 : null };
    };
    await pager.page("q", 0, fetchPage);
    await pager.page("q", 2, fetchPage); // walks page 1 then 2
    expect(seen).toEqual([undefined, 1, 2]);
    expect(await pager.page("q", 3, fetchPage)).toEqual([]);
  });
});

describe("removed Reddit posts", () => {
  it("are dropped", async () => {
    const { toItems } = await import("../src/sources/arctic.js");
    const items = toItems([
      { title: "[ Removed by moderator ]", permalink: "/r/x/comments/1/a/", created_utc: 1 },
      { title: "real", permalink: "/r/x/comments/2/b/", created_utc: 2, removed_by_category: "moderator" },
      { title: "kept", permalink: "/r/x/comments/3/c/", created_utc: 3 },
    ]);
    expect(items.map((i) => i.title)).toEqual(["kept"]);
  });
});
