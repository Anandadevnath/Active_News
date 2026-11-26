import type { RawItem } from "../types.js";

export interface CursorPage<C> {
  items: RawItem[];
  next: C | null; // null: no more pages
}

type Slot<C> = { cursor: C | undefined } | null; // undefined cursor = first page; null slot = exhausted

const MAX_QUERIES = 100;
const DEFAULT_TTL_MS = 10 * 60_000;

/**
 * Turns cursor-paged sources into the Searcher's page-number interface: remembers, per query, the
 * cursor that fetches each page, so page N continues from page N-1 instead of starting over.
 */
export class QueryPager<C> {
  private entries = new Map<string, { at: number; slots: Slot<C>[] }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  async page(query: string, page: number, fetchPage: (cursor: C | undefined) => Promise<CursorPage<C>>): Promise<RawItem[]> {
    const key = query.toLowerCase();
    const cached = this.entries.get(key);
    const fresh = cached && this.now() - cached.at < this.ttlMs ? cached : { at: this.now(), slots: [{ cursor: undefined }] as Slot<C>[] };
    const entry = { ...fresh, at: this.now() }; // sliding expiry: active scrolling keeps its position
    this.entries.delete(key); // re-insert: most recently used last
    this.entries.set(key, entry);
    if (this.entries.size > MAX_QUERIES) this.entries.delete(this.entries.keys().next().value!);

    let items: RawItem[] = [];
    for (let n = Math.min(page, entry.slots.length - 1); n <= page; n += 1) {
      const slot = entry.slots[n];
      if (!slot) return []; // this query ran out before page n
      const result = await fetchPage(slot.cursor);
      entry.slots[n + 1] = result.next === null ? null : { cursor: result.next };
      items = result.items;
    }
    return items;
  }
}
