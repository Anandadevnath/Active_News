import cors from "cors";
import express, { type Express, type Request, type RequestHandler } from "express";

import type { Searcher } from "./search.js";
import type { NewsStore } from "./store.js";
import { PLATFORMS, type Filter, type Platform, type SourceStatus } from "./types.js";

const HEARTBEAT_MS = 25_000;
const MAX_OFFSET = 10_000;
const MAX_LIMIT = 60;
const MAX_QUERY = 120;
const MAX_SEARCH_PAGE = 20;
const MAX_SEED = 2_147_483_647;
const SEARCH_RATE = { windowMs: 60_000, max: 30 };

class BadRequest extends Error {}

function parseFilter(value: unknown): Filter {
  if (value === undefined || value === "all") return "all";
  if (typeof value === "string" && (PLATFORMS as readonly string[]).includes(value)) return value as Platform;
  throw new BadRequest(`platform must be "all" or one of: ${PLATFORMS.join(", ")}`);
}

function parseInt(value: unknown, name: string, fallback: number, max: number, min = 0): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`${name} must be an integer from ${min} to ${max}`);
  return n;
}

function parseQuery(value: unknown): string {
  const q = typeof value === "string" ? value.trim() : "";
  if (!q || q.length > MAX_QUERY) throw new BadRequest(`q must be 1 to ${MAX_QUERY} characters`);
  return q;
}

/** Tiny fixed-window limiter: search fans out to external platforms, so cap it per client. */
function rateLimit({ windowMs, max }: typeof SEARCH_RATE): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    const current = entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + windowMs };
    hits.set(key, current);
    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many searches. Try again in a minute." });
      return;
    }
    next();
  };
}

const wrap =
  (handler: (req: Request) => Promise<unknown> | unknown): RequestHandler =>
  async (req, res) => {
    try {
      res.json(await handler(req));
    } catch (err) {
      if (err instanceof BadRequest) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Something went wrong on the server." });
    }
  };

export function createApp(store: NewsStore, searcher: Searcher, webOrigin: string): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: webOrigin, methods: ["GET"] }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ sources: store.statuses() });
  });

  app.get(
    "/api/feed",
    wrap((req) =>
      store.feed(
        parseFilter(req.query.platform),
        parseInt(req.query.offset, "offset", 0, MAX_OFFSET),
        parseInt(req.query.limit, "limit", 30, MAX_LIMIT, 1),
        req.query.seed === undefined ? undefined : parseInt(req.query.seed, "seed", 0, MAX_SEED),
      ),
    ),
  );

  app.get(
    "/api/search",
    rateLimit(SEARCH_RATE),
    wrap((req) =>
      searcher.search(parseQuery(req.query.q), parseFilter(req.query.platform), parseInt(req.query.page, "page", 0, MAX_SEARCH_PAGE)),
    ),
  );

  /** Server-Sent Events: "status" for platform state, "new" when a refresh finds new stories. */
  app.get("/api/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("status", { sources: store.statuses() });

    const onStatus = (_s: SourceStatus) => send("status", { sources: store.statuses() });
    const onNew = (payload: { platform: Platform; added: number }) => send("new", payload);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    store.on("status", onStatus);
    store.on("new", onNew);
    req.on("close", () => {
      clearInterval(heartbeat);
      store.off("status", onStatus);
      store.off("new", onNew);
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });
  return app;
}
