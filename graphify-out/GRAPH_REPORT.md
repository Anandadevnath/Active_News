# Graph Report - .  (2026-11-27)

## Corpus Check
- Large corpus: 398 files · ~667,959 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 681 nodes · 1460 edges · 40 communities (26 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Web Feed UI|Web Feed UI]]
- [[_COMMUNITY_Article Metadata & HTTP|Article Metadata & HTTP]]
- [[_COMMUNITY_Bluesky & Fediverse Sources|Bluesky & Fediverse Sources]]
- [[_COMMUNITY_Reddit Arctic Search|Reddit Arctic Search]]
- [[_COMMUNITY_YouTube Source|YouTube Source]]
- [[_COMMUNITY_Query Matching & Ranking|Query Matching & Ranking]]
- [[_COMMUNITY_Web Dependencies|Web Dependencies]]
- [[_COMMUNITY_Server Dependencies|Server Dependencies]]
- [[_COMMUNITY_Heat Scoring|Heat Scoring]]
- [[_COMMUNITY_NewsStore Pool|NewsStore Pool]]
- [[_COMMUNITY_Web TS Config|Web TS Config]]
- [[_COMMUNITY_4chan Source|4chan Source]]
- [[_COMMUNITY_HTTP API & Source Registry|HTTP API & Source Registry]]
- [[_COMMUNITY_Product Concepts (README)|Product Concepts (README)]]
- [[_COMMUNITY_Searcher|Searcher]]
- [[_COMMUNITY_UI Screenshot|UI Screenshot]]
- [[_COMMUNITY_Vercel Design System|Vercel Design System]]
- [[_COMMUNITY_Reference Repos|Reference Repos]]
- [[_COMMUNITY_Platform References & Interests|Platform References & Interests]]
- [[_COMMUNITY_Root Workspace|Root Workspace]]
- [[_COMMUNITY_Server TS Config|Server TS Config]]
- [[_COMMUNITY_Latest Merge|Latest Merge]]
- [[_COMMUNITY_App Icon|App Icon]]
- [[_COMMUNITY_Latest Tests|Latest Tests]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Render Deploy|Render Deploy]]
- [[_COMMUNITY_Logo|Logo]]
- [[_COMMUNITY_Fediverse Tests|Fediverse Tests]]
- [[_COMMUNITY_HN Live Tests|HN Live Tests]]
- [[_COMMUNITY_Arctic Tests|Arctic Tests]]
- [[_COMMUNITY_Bluesky Tests|Bluesky Tests]]
- [[_COMMUNITY_Endless Paging Tests|Endless Paging Tests]]
- [[_COMMUNITY_Lemmy Tests|Lemmy Tests]]
- [[_COMMUNITY_Mastodon Tests|Mastodon Tests]]
- [[_COMMUNITY_Search Source Tests|Search Source Tests]]
- [[_COMMUNITY_Next Config & CSP|Next Config & CSP]]
- [[_COMMUNITY_Outlet Tests|Outlet Tests]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Python Tools|Python Tools]]

## God Nodes (most connected - your core abstractions)
1. `RawItem` - 29 edges
2. `NewsStore` - 28 edges
3. `Platform` - 26 edges
4. `Sort` - 23 edges
5. `clip()` - 22 edges
6. `keywords()` - 21 edges
7. `filterByQuery()` - 20 edges
8. `videoFor()` - 19 edges
9. `Filter` - 17 edges
10. `youtubeThumb()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `next/font Geist Font` --semantically_similar_to--> `Geist Sans / Geist Mono Typography`  [INFERRED] [semantically similar]
  web/README.md → DESIGN.md
- `Panniantong/Agent-Reach` --semantically_similar_to--> `Agent Reach`  [INFERRED] [semantically similar]
  docs/source-references.md → README.md
- `Vercel Geist Design System Analysis` --conceptually_related_to--> `web/ (Next.js 16, React 19, Tailwind 4)`  [INFERRED]
  DESIGN.md → README.md
- `active-news-api Render Service` --implements--> `server/ (Express 5, TypeScript)`  [INFERRED]
  render.yaml → README.md
- `Next.js Agent Rules (breaking changes, read node_modules/next/dist/docs)` --conceptually_related_to--> `web/ (Next.js 16, React 19, Tailwind 4)`  [INFERRED]
  web/AGENTS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Live Feed Pipeline: sources to NewsStore to web via REST/SSE** — readme_platforms, readme_newsstore, readme_api_endpoints, readme_sse_live_stream, readme_web [EXTRACTED 1.00]
- **Geist Visual Language** — design_ink_canvas_palette, design_geist_typography, design_bimodal_button_shapes, design_hairline_cards, design_mesh_gradient [EXTRACTED 1.00]
- **Platforms aggregated into one feed** — docs_screenshot_youtube, docs_screenshot_reddit, docs_screenshot_hacker_news, docs_screenshot_4chan, docs_screenshot_x_twitter, docs_screenshot_quora, docs_screenshot_being_discussed_feed [INFERRED 0.85]

## Communities (40 total, 14 thin omitted)

### Community 0 - "Web Feed UI"
Cohesion: 0.05
Nodes (70): Feed(), LIVE_DOT, STATUS_TEXT, FeedList(), FeedListProps, ArrowUpIcon(), ChatIcon(), ChevronLeftIcon() (+62 more)

### Community 1 - "Article Metadata & HTTP"
Cohesion: 0.05
Nodes (66): BLOCKED_HOSTS, DESCRIPTION_SELECTORS, firstContent(), IMAGE_SELECTORS, parseMetaDescription(), parseMetaImage(), withArticleMeta(), parseArchivePost() (+58 more)

### Community 2 - "Bluesky & Fediverse Sources"
Cohesion: 0.05
Nodes (67): ADULT_LABELS, BskyEmbed, BskyPost, fetchBluesky(), hotPage(), https(), isHidden(), Label (+59 more)

### Community 3 - "Reddit Arctic Search"
Cohesion: 0.08
Nodes (38): arcticGet(), arcticRefresh(), ArcticResponse, arcticSearchPage(), arcticStep(), classifySubreddits(), cutAt(), groupPage() (+30 more)

### Community 4 - "YouTube Source"
Cohesion: 0.09
Nodes (30): ANY_TIME, digits(), dropRepeats(), feedPager, fetchYouTube(), HOT, innertube(), LATEST (+22 more)

### Community 5 - "Query Matching & Ranking"
Cohesion: 0.15
Nodes (22): archivePage(), byHeat(), byTime(), containsPhrase(), dedupe(), escapeRegExp(), foldAccents(), hasWordStarts() (+14 more)

### Community 6 - "Web Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, next, react, react-dom, devDependencies, eslint, eslint-config-next, postcss (+14 more)

### Community 7 - "Server Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, cheerio, cors, express, youtubei.js, devDependencies, tsx, @types/cors (+13 more)

### Community 8 - "Heat Scoring"
Cohesion: 0.17
Nodes (16): interleave(), seededRandom(), shuffleByHeat(), engagement(), itemId(), rememberEngagement(), scoreItems(), Seen (+8 more)

### Community 9 - "NewsStore Pool"
Cohesion: 0.23
Nodes (3): NewsStore, Platform, SourceStatus

### Community 10 - "Web TS Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 11 - "4chan Source"
Cohesion: 0.13
Nodes (16): ARCHIVES, boardItems(), catalogs, chanGet(), chanQueue, FALLBACK_BOARDS, fetchFourchan(), FoolFuukaPost (+8 more)

### Community 12 - "HTTP API & Source Registry"
Cohesion: 0.14
Nodes (10): SourceDef, BadRequest, createApp(), rateLimit(), SEARCH_RATE, SUGGEST_RATE, wrap(), Page (+2 more)

### Community 13 - "Product Concepts (README)"
Cohesion: 0.15
Nodes (16): Active News, REST API (/api/feed, /api/search, /api/status), Endless Scroll / Deep Paging, Heat Score (0-100) and Rising Badge, Hot vs Latest Sort, Known Limits, NewsStore (pool, heat score, paging), Pool Cache (server/.cache/pool.json) (+8 more)

### Community 14 - "Searcher"
Cohesion: 0.35
Nodes (3): Searcher, Filter, Sort

### Community 15 - "UI Screenshot"
Cohesion: 0.15
Nodes (15): 4chan, Active News Web UI Screenshot, 'Being Discussed' Card Grid, Engagement / Heat Bar, Hacker News, Header Bar (logo, search, live status), LIVE Indicator (updated Ns ago), Platform Filter Chips (+7 more)

### Community 16 - "Vercel Design System"
Cohesion: 0.23
Nodes (13): Bimodal Button Shapes (pill vs 6px square), Develop/Preview/Ship Gradient Trio, Component Specs (nav-bar, buttons, cards, bands, footer), Design Do's and Don'ts, Elevation Levels (Flat/Whisper/Floating), Geist Sans / Geist Mono Typography, Hairline-Bordered Cards, Ink-on-Canvas Palette (#171717 on #fafafa) (+5 more)

### Community 17 - "Reference Repos"
Cohesion: 0.17
Nodes (13): Panniantong/Agent-Reach, server/src/sources/article.ts, Do-Not-Use Repos (nitter, snscrape, pushshift, facebook-scraper, pygooglenews), google-news-url-decoder, HN refs (HackerNews/API, algolia/hn-search), server/src/sources/reach.ts, mozilla/readability + article-extractor, DIYgod/RSSHub (+5 more)

### Community 18 - "Platform References & Interests"
Cohesion: 0.17
Nodes (13): 4chan refs (4chan-API, FoolFuuka), Reddit refs (redlib, praw, arctic_shift, URS), YouTube refs (YouTube.js, invidious, NewPipeExtractor, yt-dlp), Arctic Shift Archive, 4chan FoolFuuka Archives (desuarchive, b4k, palanq), Google News RSS, 18 Interests Rotation, server/src/sources/interests.ts (+5 more)

### Community 19 - "Root Workspace"
Cohesion: 0.17
Nodes (11): devDependencies, concurrently, name, private, scripts, build, dev, start (+3 more)

### Community 20 - "Server TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+3 more)

### Community 21 - "Latest Merge"
Cohesion: 0.31
Nodes (3): LatestMerge, PageRun, SearchPage

### Community 22 - "App Icon"
Cohesion: 0.40
Nodes (6): Broadcast Wave Arcs, Dark Rounded Tile Background, Live Broadcast / Real-time News Concept, Active News App Icon (Live Signal Mark), Orange-to-Red Gradient (#ff9a3c to #ff453a), Signal Core Dot

### Community 24 - "Root Layout"
Cohesion: 0.40
Nodes (3): metadata, sans, serif

### Community 25 - "Render Deploy"
Cohesion: 0.40
Nodes (5): Environment Configuration, active-news-api Render Service, /api/health Health Check, server/Dockerfile, WEB_ORIGIN env (Vercel URL)

### Community 26 - "Logo"
Cohesion: 0.67
Nodes (4): Active News Logo, Live Signal Mark, Orange-Red Live Gradient, Active News Wordmark

## Ambiguous Edges - Review These
- `Platform Filter Chips` → `Quora`  [AMBIGUOUS]
  docs/screenshot.png · relation: references

## Knowledge Gaps
- **210 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `start` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Platform Filter Chips` and `Quora`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `RawItem` connect `Heat Scoring` to `Article Metadata & HTTP`, `Bluesky & Fediverse Sources`, `Reddit Arctic Search`, `YouTube Source`, `Query Matching & Ranking`, `NewsStore Pool`, `4chan Source`, `HTTP API & Source Registry`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Sort` connect `Searcher` to `Article Metadata & HTTP`, `Bluesky & Fediverse Sources`, `Reddit Arctic Search`, `YouTube Source`, `Query Matching & Ranking`, `Heat Scoring`, `HTTP API & Source Registry`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Platform` connect `NewsStore Pool` to `Article Metadata & HTTP`, `Bluesky & Fediverse Sources`, `Query Matching & Ranking`, `Heat Scoring`, `HTTP API & Source Registry`, `Searcher`, `Latest Merge`, `Latest Tests`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _214 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web Feed UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05329593267882188 - nodes in this community are weakly interconnected._
- **Should `Article Metadata & HTTP` be split into smaller, more focused modules?**
  _Cohesion score 0.05299608551641072 - nodes in this community are weakly interconnected._