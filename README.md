# Active News

One live feed of what people are discussing right now on YouTube, Reddit, Hacker News, 4chan, X/Twitter and Quora.

- **server/**: Express (TypeScript). Polls each platform on its own timer, scores every item's "heat", and pushes changes to browsers over Server-Sent Events.
- **web/**: Next.js 16. Subscribes to the stream and updates cards live, with in-page video for YouTube, Reddit and 4chan.
- **scripts/quora.py**: Quora scrape with Scrapling. Scrapling is Python-only, so the server runs this script.

## Setup (once)

```bash
npm install                                    # Node deps for server + web
uv venv --python 3.13 .venv                    # Python tools used by the server
uv pip install --python .venv -e .             # yt-dlp (YouTube) + Scrapling (Quora)
.venv/bin/scrapling install                    # browser for Scrapling
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach setup && agent-reach add reddit && agent-reach add twitter
agent-reach login twitter                      # optional: you log in yourself, needed for X
```

Do not install `agent-reach` from PyPI: that package is a different project.

## Run

```bash
npm run dev        # API on http://127.0.0.1:4000, site on http://localhost:3000
npm test           # server tests
```

Open http://localhost:3000.

## Where the news comes from

| Platform | "Being discussed right now" means | Refresh |
|---|---|---|
| Hacker News | official top stories (Firebase API) | 2 min |
| 4chan /news/ | catalog in bump order (threads getting replies) | 2 min |
| Reddit | `hot` across r/worldnews, r/news, r/technology; falls back to Agent Reach | 3 min |
| YouTube | news uploaded today, sorted by views (yt-dlp) | 5 min |
| X / Twitter | Agent Reach search "breaking news" (needs login) | 5 min |
| Quora | World News topic page (Scrapling stealth browser) | 15 min |

**Endless feed:** the server keeps a growing pool per platform, up to 1,500 stories each. When a reader scrolls near the end of a platform's stories, the server pulls that platform's next page:
- HN goes through its top, best and new lists, about 1,200 stories.
- YouTube rotates through 8 news searches, 5 pages deep.
- Reddit uses its `after` cursor.
- 4chan uses its full catalog.

**Fresh on every reload:** each visit gets a random seed that reshuffles stories of similar heat; rising stories always stay on top. Stories you have already seen on screen are hidden for 12 hours (stored in your browser only). When the page is scrolled to the top, new arrivals load on their own; further down, an "↑ N new stories" button appears instead.

**Search:** matching stories already collected, plus live search on:
- Hacker News (Algolia, titles, last 7 days)
- YouTube (this week)
- Reddit (Reddit's own search, falling back to Agent Reach)
- X (Agent Reach)

Live results older than 14 days are dropped. Search is limited to 30 requests per minute per client.

**Heat (0–100):** the larger of (a) engagement per hour of age, with HN-style gravity, and (b) measured engagement growth since the previous refresh. It is normalised per platform, so each platform's hottest item is 100. Items with the fastest growth get a **Rising** badge. The All feed is sorted by heat.

Change queries, subreddits, boards and refresh intervals at the top of each file in `server/src/sources/`.

## Configuration (env)

| Variable | Default |
|---|---|
| `PORT` / `HOST` | `4000` / `127.0.0.1` |
| `WEB_ORIGIN` (CORS) | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` (web) | `http://localhost:4000` |
| `YTDLP_BIN`, `PYTHON_BIN`, `AGENT_REACH_BIN` | `.venv/bin/*`, then `PATH` |

## Known limits

- **Reddit** answers 403 from some networks (VPNs). The server then tries Agent Reach, which may hit the same block.
- **X/Twitter** needs a one-time `agent-reach login twitter`.
- **Quora** often blocks automated browsers. Its parser (`scripts/quora.py`) has not been checked against a live page yet.
- **YouTube** results lean toward your IP's region and language even with `gl=US`.
- **Local only:** the API binds to 127.0.0.1 with no auth or rate limit. Add both before exposing it publicly.
