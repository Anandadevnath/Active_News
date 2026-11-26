# Source references

Open-source projects to read when a platform source breaks, returns thin content, or gets blocked.
Read their code for the technique (endpoints, headers, paging, parsing); do not copy AGPL or GPL code into this repo.

Checked 2026-11-27: every repo below was active (pushed in 2026) and not archived, unless marked.

## Cross-platform

| Repo | Look at | Use for |
|---|---|---|
| [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub) (AGPL-3.0) | `lib/routes/<platform>/` — has `4chan`, `bsky`, `google`, `hackernews`, `instagram`, `threads`, `tiktok`, `twitter`, `youtube` | How each platform is read without official keys; current endpoints when ours stop working |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | Its Reddit, Twitter and web-search channels | What `server/src/sources/reach.ts` calls; error meanings such as `UPSTREAM_BROKEN` |
| [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | Fetchers and anti-bot options | `scripts/quora.py` |
| [mozilla/readability](https://github.com/mozilla/readability), [extractus/article-extractor](https://github.com/extractus/article-extractor) | Article text and lead-image extraction | `server/src/sources/article.ts` when previews lack text or image |

## Per platform

| Platform | Our code | Known problem | Repos to read |
|---|---|---|---|
| Reddit | `reddit.ts`, `reddit-api.ts`, `reddit-text.ts`, `arctic.ts` | HTTP 403 on many networks; Arctic Shift scores are stale snapshots; PullPush lags ~6 weeks | [redlib-org/redlib](https://github.com/redlib-org/redlib) (AGPL-3.0; how it gets an OAuth token and avoids blocks), [praw-dev/praw](https://github.com/praw-dev/praw) (official API, rate limits), [ArthurHeitmann/arctic_shift](https://github.com/ArthurHeitmann/arctic_shift) (archive API params), [JosephLai241/URS](https://github.com/JosephLai241/URS) |
| X / Twitter | `twitter.ts`, `reach.ts` | Agent Reach login expires; empty results look like an outage | [vladkens/twscrape](https://github.com/vladkens/twscrape) (GraphQL endpoints, multi-account rotation), [d60/twikit](https://github.com/d60/twikit), [fa0311/twitter-openapi](https://github.com/fa0311/twitter-openapi) (spec of the internal GraphQL API, kept current), RSSHub `lib/routes/twitter` |
| YouTube | `youtube.ts` | No date sort in search; results lean to the IP's region and language | [LuanRT/YouTube.js](https://github.com/LuanRT/YouTube.js) (our client; search filters, continuation), [iv-org/invidious](https://github.com/iv-org/invidious) (AGPL-3.0; region and language params, search filters), [TeamNewPipe/NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) (GPL-3.0; InnerTube parsing), [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) (our fallback) |
| Hacker News | `hackernews.ts` | Algolia stops at 1,000 hits per query | [HackerNews/API](https://github.com/HackerNews/API) (official Firebase API), [algolia/hn-search](https://github.com/algolia/hn-search) (archived 2023; still shows the Algolia query shapes), RSSHub `lib/routes/hackernews` |
| 4chan | `fourchan.ts` | Archives cover 34 of ~50 work-safe boards; 1 request per second rule | [4chan/4chan-API](https://github.com/4chan/4chan-API) (official JSON API and rate rules), [FoolCode/FoolFuuka](https://github.com/FoolCode/FoolFuuka) (archived; source of the archive search API that desuarchive, b4k and palanq run), RSSHub `lib/routes/4chan` |
| Quora | `quora.ts`, `exa.ts`, `scripts/quora.py` | Blocks automated browsers; each Exa page costs credit | [exa-labs/exa-js](https://github.com/exa-labs/exa-js) (official SDK; search params), [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling). No maintained Quora scraper exists on GitHub (newest is from 2023) |
| News sites | `news.ts`, `article.ts` | Google News RSS has no image; links go through news.google.com; HTTP 429 on bursts | [SSujitX/google-news-url-decoder](https://github.com/SSujitX/google-news-url-decoder) (turns news.google.com links into publisher URLs, so `article.ts` can then fetch the image), RSSHub `lib/routes/google` |

## Platforms not covered yet

The README leaves out Facebook, Instagram and TikTok because they need a login and their terms forbid automated reading. If that changes:

| Platform | Repos |
|---|---|
| Bluesky | [bluesky-social/jetstream](https://github.com/bluesky-social/jetstream) — official public firehose, no login |
| Instagram | [instaloader/instaloader](https://github.com/instaloader/instaloader), [subzeroid/instagrapi](https://github.com/subzeroid/instagrapi), RSSHub `lib/routes/instagram` |
| TikTok | [davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api), [Evil0ctal/Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API), RSSHub `lib/routes/tiktok` |
| Threads | RSSHub `lib/routes/threads` |

## Do not use

- [zedeus/nitter](https://github.com/zedeus/nitter) — archived.
- [JustAnotherArchivist/snscrape](https://github.com/JustAnotherArchivist/snscrape) — no updates since 2023; its X module no longer works.
- [pushshift/api](https://github.com/pushshift/api) — Pushshift is closed to the public; use Arctic Shift or PullPush.
- [kevinzg/facebook-scraper](https://github.com/kevinzg/facebook-scraper), [kotartemiy/pygooglenews](https://github.com/kotartemiy/pygooglenews) — no updates since 2024.
