# Graph Report - .  (2026-11-27)

## Corpus Check
- Corpus is ~4,652 words - fits in a single context window. You may not need a graph.

## Summary
- 126 nodes · 194 edges · 11 communities (8 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.78)
- Token cost: 71,737 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Feed List & API Client|Feed List & API Client]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_News Card & Video|News Card & Video]]
- [[_COMMUNITY_Next.js Agent Docs|Next.js Agent Docs]]
- [[_COMMUNITY_Feed Page & Status|Feed Page & Status]]
- [[_COMMUNITY_Root Layout & Fonts|Root Layout & Fonts]]
- [[_COMMUNITY_Seen-Story Storage|Seen-Story Storage]]
- [[_COMMUNITY_Next Config & CSP|Next Config & CSP]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Next.js Project (web)` - 7 edges
3. `Feed()` - 6 edges
4. `timeAgo()` - 5 edges
5. `safeUrl()` - 5 edges
6. `Platform` - 5 edges
7. `Filter` - 5 edges
8. `Sort` - 5 edges
9. `scripts` - 5 edges
10. `NewsCardImpl()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `node_modules/next/dist/docs` --semantically_similar_to--> `Next.js Documentation`  [INFERRED] [semantically similar]
  AGENTS.md → README.md
- `next dev` --semantically_similar_to--> `Development Server (npm run dev)`  [INFERRED] [semantically similar]
  AGENTS.md → README.md
- `NewsCardImpl()` --calls--> `timeAgo()`  [EXTRACTED]
  components/NewsCard.tsx → lib/format.ts
- `Next.js Version Breaking Changes` --conceptually_related_to--> `Next.js Documentation`  [INFERRED]
  AGENTS.md → README.md
- `Feed()` --calls--> `timeAgo()`  [EXTRACTED]
  components/Feed.tsx → lib/format.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Next.js Learning Resources** — web_readme_nextjs_documentation, web_readme_learn_nextjs, web_readme_nextjs_github_repo [EXTRACTED 1.00]
- **Agent Rules Regeneration Flow** — web_agents_next_dev, web_agents_generate_agent_files, web_agents_nextjs_agent_rules [INFERRED 0.85]

## Communities (11 total, 3 thin omitted)

### Community 0 - "Package Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, next, react, react-dom, devDependencies, eslint, eslint-config-next, postcss (+14 more)

### Community 1 - "Feed List & API Client"
Cohesion: 0.21
Nodes (15): FeedList(), FeedListProps, getFeed(), getJson(), newSeed(), searchNews(), FeedPage, Filter (+7 more)

### Community 2 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 3 - "News Card & Video"
Cohesion: 0.22
Nodes (13): metricsText(), NewsCard, NewsCardImpl(), NewsCardProps, ACCENT, VideoPlayer(), VideoPlayerProps, compact() (+5 more)

### Community 4 - "Next.js Agent Docs"
Cohesion: 0.16
Nodes (16): generate-agent-files.js, node_modules/next/dist/docs, next dev, Next.js Agent Rules, Next.js Version Breaking Changes, app/page.tsx, create-next-app, Development Server (npm run dev) (+8 more)

### Community 5 - "Feed Page & Status"
Cohesion: 0.22
Nodes (9): DOT, Feed(), LIVE_DOT, STATUS_TEXT, timeAgo(), UNITS, fixHint(), useLiveStatus() (+1 more)

### Community 6 - "Root Layout & Fonts"
Cohesion: 0.40
Nodes (3): metadata, sans, serif

### Community 7 - "Seen-Story Storage"
Cohesion: 0.60
Nodes (4): loadSeen(), recordSeen(), saveSeen(), SeenMap

## Knowledge Gaps
- **55 isolated node(s):** `sans`, `serif`, `metadata`, `DOT`, `LIVE_DOT` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `sans`, `serif`, `metadata` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._