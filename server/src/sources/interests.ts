/**
 * What people come to each platform for. Every source reads all of them: YouTube searches each `query`,
 * X and Quora search it as a topic, Reddit reads the `subreddits` (all work-safe, 300k+ members, checked
 * against the Arctic Shift subreddit list).
 */
export interface Interest {
  label: string;
  query: string;
  subreddits: readonly string[];
}

export const INTERESTS: readonly Interest[] = [
  { label: "News", query: "news", subreddits: ["worldnews", "news", "politics", "UpliftingNews"] },
  { label: "Tech", query: "technology", subreddits: ["technology", "gadgets", "programming", "Android", "apple"] },
  { label: "AI", query: "artificial intelligence", subreddits: ["artificial", "OpenAI", "singularity", "ChatGPT", "Futurology"] },
  { label: "Gaming", query: "gaming", subreddits: ["gaming", "Games", "pcgaming", "PS5", "NintendoSwitch"] },
  { label: "Music", query: "music", subreddits: ["Music", "hiphopheads", "popheads", "indieheads", "kpop"] },
  { label: "Movies & TV", query: "movie trailer", subreddits: ["movies", "television", "netflix", "marvelstudios", "boxoffice"] },
  { label: "Anime", query: "anime", subreddits: ["anime", "manga", "OnePiece", "Naruto", "anime_irl"] },
  { label: "Sports", query: "sports highlights", subreddits: ["sports", "soccer", "nba", "nfl", "formula1", "Cricket"] },
  { label: "Science & space", query: "science", subreddits: ["science", "space", "askscience", "Physics", "EarthPorn"] },
  { label: "Money", query: "business finance", subreddits: ["business", "Economics", "personalfinance", "stocks", "CryptoCurrency"] },
  { label: "Food", query: "cooking", subreddits: ["food", "Cooking", "recipes", "AskCulinary", "FoodPorn"] },
  { label: "Health & fitness", query: "fitness", subreddits: ["Fitness", "health", "nutrition", "loseit"] },
  { label: "Travel", query: "travel", subreddits: ["travel", "solotravel", "backpacking"] },
  { label: "Cars", query: "cars", subreddits: ["cars", "Justrolledintotheshop"] },
  { label: "Fun", query: "funny", subreddits: ["funny", "memes", "interestingasfuck", "mildlyinteresting", "aww", "Damnthatsinteresting"] },
  { label: "Learn", query: "explained", subreddits: ["todayilearned", "explainlikeimfive", "LifeProTips", "AskReddit", "NoStupidQuestions"] },
  { label: "Art & DIY", query: "art", subreddits: ["Art", "DIY", "photography", "crafts"] },
  { label: "Books", query: "books", subreddits: ["books", "Fantasy", "suggestmeabook"] },
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
