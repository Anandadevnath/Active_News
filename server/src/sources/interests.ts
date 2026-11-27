/**
 * What people come to each platform for. Every source reads all of them: YouTube searches each `query`,
 * X searches it as a topic, Reddit reads the `subreddits` (all work-safe, 300k+ members, checked
 * against the Arctic Shift subreddit list).
 */
export interface Interest {
  label: string;
  query: string;
  subreddits: readonly string[];
  /** The interest's news outlets: their own RSS / Atom feeds, with direct links and pictures (checked 2026-11-27). */
  feeds: readonly string[];
}

export const INTERESTS: readonly Interest[] = [
  { label: "News", query: "news", subreddits: ["worldnews", "news", "politics", "UpliftingNews"] , feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "https://feeds.npr.org/1001/rss.xml", "https://www.aljazeera.com/xml/rss/all.xml"] },
  { label: "Tech", query: "technology", subreddits: ["technology", "gadgets", "programming", "Android", "apple"] , feeds: ["https://www.theverge.com/rss/index.xml", "https://feeds.arstechnica.com/arstechnica/index", "https://www.engadget.com/rss.xml"] },
  { label: "AI", query: "artificial intelligence", subreddits: ["artificial", "OpenAI", "singularity", "ChatGPT", "Futurology"] , feeds: ["https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "https://techcrunch.com/category/artificial-intelligence/feed/"] },
  { label: "Gaming", query: "gaming", subreddits: ["gaming", "Games", "pcgaming", "PS5", "NintendoSwitch"] , feeds: ["https://www.polygon.com/rss/index.xml", "https://www.eurogamer.net/feed", "https://kotaku.com/rss", "https://feeds.feedburner.com/ign/games-all"] },
  { label: "Music", query: "music", subreddits: ["Music", "hiphopheads", "popheads", "indieheads", "kpop"] , feeds: ["https://pitchfork.com/feed/feed-news/rss", "https://www.nme.com/news/music/feed", "https://www.rollingstone.com/music/feed/"] },
  { label: "Movies & TV", query: "movie trailer", subreddits: ["movies", "television", "netflix", "marvelstudios", "boxoffice"] , feeds: ["https://variety.com/feed/", "https://deadline.com/feed/"] },
  { label: "Anime", query: "anime", subreddits: ["anime", "manga", "OnePiece", "Naruto", "anime_irl"] , feeds: ["https://myanimelist.net/rss/news.xml", "https://www.animenewsnetwork.com/all/rss.xml"] },
  { label: "Sports", query: "sports highlights", subreddits: ["sports", "soccer", "nba", "nfl", "formula1", "Cricket"] , feeds: ["https://feeds.bbci.co.uk/sport/rss.xml"] },
  { label: "Science & space", query: "science", subreddits: ["science", "space", "askscience", "Physics", "EarthPorn"] , feeds: ["https://www.space.com/feeds/all", "https://www.nasa.gov/feed/", "https://www.sciencedaily.com/rss/all.xml"] },
  { label: "Money", query: "business finance", subreddits: ["business", "Economics", "personalfinance", "stocks", "CryptoCurrency"] , feeds: ["https://feeds.bbci.co.uk/news/business/rss.xml", "https://www.cnbc.com/id/100003114/device/rss/rss.html"] },
  { label: "Food", query: "cooking", subreddits: ["food", "Cooking", "recipes", "AskCulinary", "FoodPorn"] , feeds: ["https://www.bonappetit.com/feed/rss"] },
  { label: "Health & fitness", query: "fitness", subreddits: ["Fitness", "health", "nutrition", "loseit"] , feeds: ["https://www.menshealth.com/rss/all.xml/"] },
  { label: "Travel", query: "travel", subreddits: ["travel", "solotravel", "backpacking"] , feeds: ["https://www.cntraveler.com/feed/rss"] },
  { label: "Cars", query: "cars", subreddits: ["cars", "Justrolledintotheshop"] , feeds: ["https://www.caranddriver.com/rss/all.xml/", "https://www.motor1.com/rss/news/all/"] },
  { label: "Fun", query: "funny", subreddits: ["funny", "memes", "interestingasfuck", "mildlyinteresting", "aww", "Damnthatsinteresting"] , feeds: ["https://www.mentalfloss.com/rss.xml", "https://www.boredpanda.com/feed/"] },
  { label: "Learn", query: "explained", subreddits: ["todayilearned", "explainlikeimfive", "LifeProTips", "AskReddit", "NoStupidQuestions"] , feeds: ["https://www.atlasobscura.com/feeds/latest", "https://www.smithsonianmag.com/rss/latest_articles/", "https://www.vox.com/rss/explainers/index.xml"] },
  { label: "Art & DIY", query: "art", subreddits: ["Art", "DIY", "photography", "crafts"] , feeds: ["https://www.designboom.com/feed/", "https://www.thisiscolossal.com/feed/"] },
  { label: "Books", query: "books", subreddits: ["books", "Fantasy", "suggestmeabook"] , feeds: ["https://lithub.com/feed/", "https://bookriot.com/feed/"] },
];

/** Topic for cursor step n (sources without real paging search the next interest each page, wrapping around). */
export function topicAt(step: number): string {
  return INTERESTS[step % INTERESTS.length]!.query;
}

/** Parse a step cursor; null (the live first page) is step 0. */
export function stepOf(cursor: string | null): number {
  const n = Number(cursor ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Live refreshes take turns: each call returns the next `perTurn` indexes of 0..size-1, wrapping,
 * so every interest gets its newest posts read regularly instead of only the first one.
 */
export function rotation(size: number, perTurn: number): () => number[] {
  let turn = 0;
  return () => {
    const start = turn * perTurn;
    turn += 1;
    return Array.from({ length: Math.min(perTurn, size) }, (_, i) => (start + i) % size);
  };
}
