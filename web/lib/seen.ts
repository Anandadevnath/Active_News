/**
 * Stories this browser has already shown on screen. Per-viewer convenience only: stored in
 * localStorage, and the app works the same if storage is blocked (nothing gets hidden).
 */
const STORAGE_KEY = "active-news:seen:v1";
const TTL_MS = 12 * 60 * 60 * 1000; // a story can come back after 12 hours
const MAX_IDS = 5000;

type SeenMap = Map<string, number>;

export function loadSeen(now = Date.now()): SeenMap {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return new Map();
    return new Map(
      raw.filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "number" && now - e[1] < TTL_MS),
    );
  } catch {
    return new Map();
  }
}

export function saveSeen(seen: SeenMap): void {
  try {
    const newest = [...seen].sort((a, b) => b[1] - a[1]).slice(0, MAX_IDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newest));
  } catch {
    // storage full or blocked: seen-tracking is optional
  }
}

/** Merge newly seen ids into storage (read-modify-write so other tabs' entries survive). */
export function recordSeen(ids: Iterable<string>, now = Date.now()): void {
  const seen = loadSeen(now);
  for (const id of ids) seen.set(id, now);
  saveSeen(seen);
}
