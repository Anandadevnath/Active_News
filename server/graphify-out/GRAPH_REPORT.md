# Graph Report - .  (2026-11-27)

## Corpus Check
- Corpus is ~21,210 words - fits in a single context window. You may not need a graph.

## Summary
- 355 nodes · 878 edges · 17 communities (12 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Article Meta and Media|Article Meta and Media]]
- [[_COMMUNITY_Express API and Store|Express API and Store]]
- [[_COMMUNITY_Feed Ranking and Matching|Feed Ranking and Matching]]
- [[_COMMUNITY_Reddit Arctic Shift|Reddit Arctic Shift]]
- [[_COMMUNITY_Interests and HTTP Helpers|Interests and HTTP Helpers]]
- [[_COMMUNITY_YouTube Source|YouTube Source]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_4chan Source|4chan Source]]
- [[_COMMUNITY_Config, Exa, Reddit API|Config, Exa, Reddit API]]
- [[_COMMUNITY_Google News Source|Google News Source]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Latest Search Merge|Latest Search Merge]]
- [[_COMMUNITY_Arctic Tests|Arctic Tests]]
- [[_COMMUNITY_Endless Sources Tests|Endless Sources Tests]]
- [[_COMMUNITY_Search Source Tests|Search Source Tests]]
- [[_COMMUNITY_Quora Search Tests|Quora Search Tests]]

## God Nodes (most connected - your core abstractions)
1. `RawItem` - 25 edges
2. `NewsStore` - 24 edges
3. `Platform` - 24 edges
4. `Sort` - 18 edges
5. `clip()` - 16 edges
6. `keywords()` - 15 edges
7. `NewsItem` - 15 edges
8. `filterByQuery()` - 14 edges
9. `Filter` - 14 edges
10. `videoFor()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `start()` --calls--> `createApp()`  [EXTRACTED]
  test/store-app.test.ts → src/app.ts
- `pullpushTitle()` --calls--> `keywords()`  [EXTRACTED]
  src/sources/arctic.ts → src/feed.ts
- `topicSubreddits()` --calls--> `keywords()`  [EXTRACTED]
  src/sources/arctic.ts → src/feed.ts
- `archivePage()` --calls--> `keywords()`  [EXTRACTED]
  src/sources/fourchan.ts → src/feed.ts
- `arcticSearchPage()` --calls--> `filterByQuery()`  [EXTRACTED]
  src/sources/arctic.ts → src/feed.ts

## Import Cycles
- None detected.

## Communities (17 total, 5 thin omitted)

### Community 0 - "Article Meta and Media"
Cohesion: 0.08
Nodes (47): BLOCKED_HOSTS, DESCRIPTION_SELECTORS, firstContent(), IMAGE_SELECTORS, parseMetaDescription(), parseMetaImage(), withArticleMeta(), parseArchivePost() (+39 more)

### Community 1 - "Express API and Store"
Cohesion: 0.09
Nodes (18): SOURCES, BadRequest, createApp(), rateLimit(), SEARCH_RATE, wrap(), dedupe(), interleave() (+10 more)

### Community 2 - "Feed Ranking and Matching"
Cohesion: 0.10
Nodes (27): SourceDef, byHeat(), byTime(), containsPhrase(), hasWordStarts(), matchesQuery(), seededRandom(), shuffleByHeat() (+19 more)

### Community 3 - "Reddit Arctic Shift"
Cohesion: 0.09
Nodes (35): arcticGet(), arcticRefresh(), ArcticResponse, arcticSearchPage(), arcticStep(), classifySubreddits(), cutAt(), groupPage() (+27 more)

### Community 4 - "Interests and HTTP Helpers"
Cohesion: 0.12
Nodes (28): archivePage(), searchHackerNews(), execFileAsync, runCli(), Interest, INTERESTS, rotation(), stepOf() (+20 more)

### Community 5 - "YouTube Source"
Cohesion: 0.09
Nodes (30): ANY_TIME, digits(), dropRepeats(), feedPager, fetchYouTube(), HOT, innertube(), LATEST (+22 more)

### Community 6 - "Package Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, cheerio, cors, express, youtubei.js, devDependencies, tsx, @types/cors (+13 more)

### Community 7 - "4chan Source"
Cohesion: 0.14
Nodes (16): ARCHIVES, boardItems(), catalogs, chanGet(), chanQueue, FALLBACK_BOARDS, fetchFourchan(), FoolFuukaPost (+8 more)

### Community 8 - "Config, Exa, Reddit API"
Cohesion: 0.17
Nodes (10): ExaQuery, ExaResult, exaSearch(), parseExaResults(), accessToken(), redditApiGet(), config, ENV_FILE (+2 more)

### Community 9 - "Google News Source"
Cohesion: 0.24
Nodes (12): cache, day(), fetchNews(), getFeed(), nextTopic, parseNewsRss(), queue, searchPager (+4 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+3 more)

## Knowledge Gaps
- **102 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+97 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RawItem` connect `Feed Ranking and Matching` to `Article Meta and Media`, `Express API and Store`, `Reddit Arctic Shift`, `Interests and HTTP Helpers`, `YouTube Source`, `4chan Source`, `Config, Exa, Reddit API`, `Google News Source`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Platform` connect `Express API and Store` to `Config, Exa, Reddit API`, `Article Meta and Media`, `Feed Ranking and Matching`, `Latest Search Merge`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `Sort` connect `Feed Ranking and Matching` to `Article Meta and Media`, `Express API and Store`, `Reddit Arctic Shift`, `Interests and HTTP Helpers`, `YouTube Source`, `Google News Source`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _102 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Article Meta and Media` be split into smaller, more focused modules?**
  _Cohesion score 0.08080808080808081 - nodes in this community are weakly interconnected._
- **Should `Express API and Store` be split into smaller, more focused modules?**
  _Cohesion score 0.08776595744680851 - nodes in this community are weakly interconnected._
- **Should `Feed Ranking and Matching` be split into smaller, more focused modules?**
  _Cohesion score 0.10404040404040404 - nodes in this community are weakly interconnected._