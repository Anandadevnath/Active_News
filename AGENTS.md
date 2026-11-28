# Active News — Agent Instructions

## Project Structure

Monorepo with two workspaces:

| Folder | Stack | Role |
|--------|-------|------|
| `server/` | Express 5, TypeScript (ESM, NodeNext) | API: polls 12 platforms, scores heat, serves feed/search/SSE |
| `web/` | Next.js 16, React 19, Tailwind CSS 4 | Frontend: feed, search, video players, endless scroll |

## Commands

Run from repo root:

| Command | What it does |
|---------|--------------|
| `npm install` | Installs all workspaces |
| `npm run dev` | Starts server (tsx watch) + web (next dev) with hot reload |
| `npm run start` | Starts both without hot reload |
| `npm run build` | Builds web for production (`next build`) |
| `npm test` | Runs server tests only (Vitest) |
| `npm run typecheck` | Type-checks server (`tsc --noEmit`) + web (`tsc --noEmit`) |

Server-only: `npm run test -w server`, `npm run typecheck -w server`
Web-only: `npm run build -w web`, `npm run lint -w web`. Web has **no** `typecheck` script — type-check it with `npx -w web tsc --noEmit`.

Single server test: `npx vitest run server/test/<file>.test.ts -w server`

## Setup (one-time)

1. **Node 20+** (Docker image uses 24)
2. **Python 3.13 + uv**: `uv venv --python 3.13 .venv && uv pip install --python .venv -e .` — installs `yt-dlp` (YouTube fallback; the server prefers `.venv/bin/yt-dlp`, then `PATH`) and `scrapling`, which the workspace MCP server in `.mcp.json` runs from `.venv/bin/scrapling`
3. **Agent Reach** (browser reads for X/Twitter, Facebook, Instagram, TikTok):
   ```
   uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
   agent-reach setup && agent-reach add reddit && agent-reach add twitter
   agent-reach add instagram && agent-reach add facebook   # optional platforms
   ```
   > Install from the GitHub release URL, not PyPI (different package).
4. Optional logins (the user does them): `agent-reach login twitter` (X search), `agent-reach login instagram` (all Instagram reads), `agent-reach login facebook` (only if Facebook blocks the network). TikTok needs no login for the feed.
5. **Instagram adapter patch** (one-time, machine-local): `opencli adapter eject instagram`, then copy `docs/opencli/instagram-user.js` over `~/.opencli/clis/instagram/user.js` — the packaged `instagram user` command returns no post URLs, which the server needs.

## Environment

Config lives in `server/src/config.ts`. README says to copy `server/.env.example`, but **no such file is committed** — create `server/.env` (git-ignored) by hand. Variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `HOST` | `4000` / `127.0.0.1` | API listen address |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS origin |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API URL for web |
| `REDDIT_CLIENT_ID/SECRET` | unset | Reddit "script" app for official API |
| `YTDLP_BIN` | `.venv/bin/yt-dlp` if present, else `yt-dlp` on `PATH` | YouTube fallback binary; also reads TikTok user feeds |
| `AGENT_REACH_BIN` | `agent-reach` on `PATH` (no `.venv` lookup) | Agent Reach CLI binary |
| `OPENCLI_BIN` | `~/.agent-reach/tools/npm-global/bin/opencli` if present, else `opencli` on `PATH` | OpenCLI binary (TikTok/Instagram browser reads) |

`server/.env` is loaded via `process.loadEnvFile` in `config.ts`, **unless running under Vitest** — tests never read `.env`, so they cannot hit real APIs with your keys. Real environment variables win over the file.

## Architecture Notes

No database and no shared package: the workspaces meet only at the HTTP API.

**Server** (`server/src/`)

- **Entry point**: `index.ts` — wires `NewsStore` + `Searcher`, restores the snapshot, starts polling once `listen` succeeds, saves the snapshot on SIGINT/SIGTERM
- **Sources**: one module per platform in `sources/*.ts`, exporting `fetch<Platform>(cursor)` → `Page` and an optional `search<Platform>(query, page, sort)`; registered in `sources/index.ts` (`SOURCES: Record<Platform, SourceDef>`) with `intervalMs` and optional `live` (HN stream), `replaceOnRefresh` (4chan), `readAhead`. `fetch(null)` is the live first page every refresh re-reads; any other cursor is a deeper page
- **Browser-backed sources**: `sources/browser.ts` binds direct `opencli <site>` commands to the Agent Reach dedicated browser (reads the context id from `agent-reach browser status`, caches it 4 min), so TikTok (`explore`) and Instagram (`user`) run inside the logged-in session without going through an Agent Reach channel. X/Twitter and Facebook call the `agent-reach` CLI itself (via `sources/reach.ts`)
- **Pool / paging / snapshot**: `store.ts` (`NewsStore`, an `EventEmitter` emitting `status` and `new`; up to 20,000 stories per platform); latest-sort merge in `latest.ts` (`LatestMerge`); heat scoring in `heat.ts`; sort/interleave/query helpers in `feed.ts`; live search in `search.ts` (`Searcher`)
- **Source helpers**: `sources/http.ts` (all network and CLI access — see Conventions), `sources/pager.ts` (`QueryPager`: cursor-paged search behind page numbers), `sources/spaced.ts` (`spaced(gapMs)`: one-at-a-time queue for rate-limited sites), `sources/interests.ts` (`INTERESTS` — label, query, subreddits, RSS feeds — plus `topicAt`/`stepOf`/`rotation` for refreshes that take turns over the interests), `sources/reach.ts` (Agent Reach CLI wrapper), `sources/arctic.ts` (Arctic Shift + PullPush archives), `sources/article.ts` / `sources/outlets.ts` (cheerio: article meta tags / RSS + Atom feeds), `media.ts` (item normalising: `clip`, `stripHtml`, `videoFor`, `youtubeId`…)
- **Cache**: pool persisted to `server/.cache/pool.json` every 2 min and on shutdown (atomic `.tmp` + rename), restored at startup — 3,000 stories per platform, anything older than 24 h dropped
- **API** (`app.ts`, `createApp(store, searcher, webOrigin)`; GET-only, CORS limited to `WEB_ORIGIN`): `/api/feed` (limit ≤ 60), `/api/search` (rate-limited 30/min per IP, `fast=1` for partial), `/api/suggest` (120/min, pool only), `/api/status`, `/api/stream` (SSE: `status` and `new` events, 25 s heartbeat), `/api/health`

**Web** (`web/`)

- `app/page.tsx` only renders `<Feed />`. `components/Feed.tsx` is the stateful client root (filter, sort, search, suggestions, topic chips, drawer); `FeedList.tsx` owns paging and endless scroll; `NewsCard`, `RisingShelf`, `ScrollRow`, `Sidebar`, `VideoPlayer`, `icons` and `platformStyle.ts` are presentational
- `lib/`: `api.ts` (every API call, `cache: "no-store"`), `types.ts` (copy of the server types), `seen.ts` (seen-story IDs in localStorage, 12 h), `useLiveStatus.ts` (the `/api/stream` SSE connection), `useNow.ts`, `format.ts`

## Conventions

- **Imports**: the server is NodeNext ESM run straight from TypeScript by `tsx` (no build step, in Docker too), so relative imports **must** end in `.js` (`./store.js`). Web imports use the `@/` alias for the `web/` root (`@/lib/types`), no extension
- **Hand-synced copies** (no shared package): `server/src/types.ts` ↔ `web/lib/types.ts` (`PLATFORMS`, `NewsItem`, `Sort`… — change one, mirror the other); interests in `sources/interests.ts` ↔ topic chips in `web/lib/types.ts` (`TOPICS`)
- **Network access** goes through `sources/http.ts`: `fetchText`/`fetchJson` for platform APIs; `fetchPublicText` for URLs taken from posts (https only, refuses private/loopback addresses, re-checks every redirect — the SSRF guard, don't bypass it); `runCli` (no shell) for yt-dlp and Agent Reach. The only direct `fetch` calls are the HN live SSE stream (`hackernews.ts`) and Reddit OAuth (`reddit-api.ts`)
- **Bump `SNAPSHOT_VERSION`** in `store.ts` whenever `RawItem` changes shape, so stale `pool.json` files are ignored
- **Error text is an interface**: `fixHint()` in `web/lib/types.ts` matches substrings of server error messages (`NEED_LOGIN`, `UPSTREAM_BROKEN`, `Arctic Shift`, `Google News`, `not found`) — keep them when rewording a source's errors
- **Feed seed**: `newSeed()` in `web/lib/api.ts` shuffles equal-heat stories per visit; reuse it for every page of that visit or paging breaks
- **Styling**: Tailwind 4 utilities only; `app/globals.css` holds design tokens and nothing else. Dark theme only, fonts Geist + Newsreader via `next/font/google`. Tailwind only sees literal class names, so platform classes live as full strings in `platformStyle.ts` — never build a class name by concatenation
- **CSP** (`next.config.ts`; no nonce, so the page stays static): scripts are `'self'` + inline only; frames only from `https://www.youtube-nocookie.com` (YouTube embeds must use that host); `connect-src` is `'self'` + `NEXT_PUBLIC_API_URL` — add a host there before the web app fetches or streams from it. `Referrer-Policy: no-referrer` is deliberate: `video.twimg.com` answers 403 to any Referer

**Adding a platform** — TypeScript walks you through most of it, since `SOURCES`, `PLATFORM_LABEL`, `ACCENT` and `MARK` are all `Record<Platform, …>`:

1. Add the id to `PLATFORMS` in **both** types files
2. Write `sources/<platform>.ts` (`fetch<Platform>`, optional `search<Platform>`) and register it in `sources/index.ts`
3. Web: `--color-<platform>` token in `globals.css`, `ACCENT` + `MARK` in `platformStyle.ts`, `PLATFORM_LABEL` in `lib/types.ts`; CSP hosts in `next.config.ts` if it embeds or loads from new hosts
4. Tests in `server/test/` following the mocking patterns under Testing

## Testing

- Server tests: `server/test/*.test.ts` (Vitest, no config file; run with `-w server`). No web tests configured
- `npm test` takes ~15 s, ~14 of them in `search-sources.test.ts` (real 2 s spacing between Google News requests); every other file finishes in under a second
- Tests make no network calls and never read `.env`. Two isolation patterns:
  - **Mock the HTTP helpers** (most source tests): `const { fetchJson, fetchText } = vi.hoisted(() => ({ fetchJson: vi.fn(), fetchText: vi.fn() }));` then `vi.mock("../src/sources/http.js", () => ({ fetchJson, fetchText }))`. Agent Reach is mocked the same way (`vi.mock("../src/sources/reach.js")`)
  - **Stub `global.fetch`** with `vi.stubGlobal("fetch", …)` for the code that calls `fetch` itself: `http.test.ts`, `hn-live.test.ts`, `credentials-sources.test.ts`
- Store and API tests (`store-app.test.ts`) build `NewsStore` / `createApp` from in-memory fake `SourceDef`s — the constructor takes a partial source map, so one platform is enough
- Parsers (`parseHnItem`, `parseCatalog`, `parseReachOutput`…) are tested with plain fixture objects: keep parsing functions exported and free of side effects
- `npm run typecheck -w server` covers `test/` too (`tsconfig.json` includes it)

## Deploy

- Render blueprint (`render.yaml`) builds `server/Dockerfile` and serves only the API; frontend deploys separately (Vercel) with `WEB_ORIGIN` set to the Vercel URL
- The image runs the TypeScript source directly (`npx tsx src/index.ts`) — there is no server build step. It installs only the standalone `yt-dlp` binary: no Python and no Agent Reach, so X/Twitter returns nothing on that deploy
- In Docker: `HOST=0.0.0.0 PORT=10000 NODE_ENV=production`; `render.yaml` sets `NODE_OPTIONS=--max-old-space-size=384` (free plan has 512 MB)
- Free Render plan sleeps after 15 min idle; ping `/api/health` to keep it awake

## TypeScript

- No root tsconfig; server uses `server/tsconfig.json` (NodeNext ESM, strict, `noUncheckedIndexedAccess` — indexed access yields `T | undefined`)
- Web uses `web/tsconfig.json` (bundler resolution, `@/*` → `./*`) — Next.js 16 conventions (see `web/AGENTS.md`)

## Known Quirks

- **Reddit**: Blocks many IPs → falls back to Arctic Shift (snapshot scores) + PullPush (~6 weeks behind)
- **X/Twitter**: Needs a logged-in Agent Reach browser session; it expires periodically. An expired login surfaces as `UPSTREAM_BROKEN: … returned no items`, which looks like an outage but is a login problem
- **Instagram**: Every read needs an Instagram login (`agent-reach login instagram`); logged-out reads 404 and surface as `NEED_LOGIN`. Has no post search — only user search, so only the collected pool is searched. Thumbnails and mp4s are signed CDN URLs that expire within hours
- **Facebook**: Search works without a login but takes ~15-20 s per query through the browser (interval 10 min, `readAhead` 60). The feed keeps post-shaped URLs only (pages, profiles and groups are dropped) and rotates the interest topics; Facebook has no paging, so only page 0 of search is live
- **TikTok**: The feed works with no login — `opencli tiktok explore` (live trending) on refresh, curated accounts via yt-dlp for deeper pages. TikTok's own search API returns an empty body logged out, so only the pool is searched. Cover URLs are signed and expire; photo posts become image cards
- **News search**: Uses Google News RSS (rate-limited: 2s spacing, 2min pause on 429)
- **Bluesky videos**: HLS streams — cards show thumbnail, open post
- **Mastodon search**: Hashtag-only (no full-text without login)
- **4chan archives**: Only 34 of ~50 work-safe boards covered
- **API binds to 127.0.0.1** — no auth; add before exposing publicly

## References

- `README.md` — full feature list, API docs, source table
- `docs/source-references.md` — open-source projects to read when a platform source breaks. It carries a rule: learn the technique, never copy AGPL/GPL code into this repo
- `docs/opencli/instagram-user.js` — the patched Instagram adapter to copy into `~/.opencli/clis/instagram/` after `opencli adapter eject instagram` (see Setup)
- `DESIGN.md` — Vercel/Geist design-system analysis (type scale, radius, spacing, do's and don'ts). It describes a light canvas; the app is dark-only, so `web/app/globals.css` and the components are the source of truth for the actual look
- `web/AGENTS.md` — Next.js 16 agent rules, re-added by `next dev` on every run (commit it rather than deleting it)
- `web/README.md` is the stock create-next-app text, not project documentation
- Not project code — exclude from searches: `graphify-out/` (root, `server/`, `web/`: generated code-graph output, tracked in git), `.claude-flow/`, `.swarm/`, `.serena/`, `.claude/`, `.playwright-mcp/` (other agent tooling state), `.agents/skills/` (workspace skills)
