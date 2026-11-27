"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFeed, newSeed, searchNews } from "@/lib/api";
import { safeUrl } from "@/lib/format";
import { loadSeen, recordSeen } from "@/lib/seen";
import { PLATFORM_LABEL, type Filter, type NewsItem, type Platform, type SearchPage, type Sort } from "@/lib/types";

import { NewsCard } from "./NewsCard";
import { RisingShelf } from "./RisingShelf";

const PAGE_SIZE = 30;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] items-stretch gap-x-4 gap-y-10";
const BAR = "rounded-full bg-white/[0.07]";
const SHELF_MIN = 4; // fewer rising stories with pictures than this: no shelf
const SHELF_MAX = 12;

/** Placeholder with the same slots and sizes as NewsCard, so nothing jumps when stories arrive. */
function SkeletonCard() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
      <div className="aspect-video w-full rounded-xl bg-white/[0.05] ring-1 ring-white/10" />
      <div className="flex gap-3">
        <div className="mt-0.5 size-9 shrink-0 rounded-full bg-white/[0.07]" />
        <div className="flex min-h-27 flex-1 flex-col gap-2.5 pt-1">
          <div className={`h-4 w-full ${BAR}`} />
          <div className={`h-4 w-3/4 ${BAR}`} />
          <div className={`mt-1 h-3 w-1/2 ${BAR}`} />
          <div className={`h-3 w-2/3 ${BAR}`} />
        </div>
      </div>
    </div>
  );
}
const MAX_EMPTY_PAGES = 5; // stop auto-skipping after this many pages of already-seen stories
const SEEN_FLUSH_MS = 3000;
const SEEN_VISIBLE_RATIO = 0.6;

interface FeedListProps {
  filter: Filter;
  sort: Sort;
  query: string; // empty = live feed, otherwise search
  heading: string;
  includeSeen: boolean;
  now: number | null;
  onPlayingChange: (id: string, playing: boolean) => void;
  onShowSeen: () => void;
}

/**
 * Endless list. Feed mode pages through /api/feed and hides stories this browser has already
 * seen (snapshot taken on mount, so a reload starts with fresh stories). Search mode pages /api/search.
 * Remount (change `key`) to start over.
 */
export function FeedList({ filter, sort, query, heading, includeSeen, now, onPlayingChange, onShowSeen }: FeedListProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [searchErrors, setSearchErrors] = useState<SearchPage["errors"]>([]);
  const [pending, setPending] = useState<Platform[]>([]); // platforms still searching while a quick first page shows
  const [shelf, setShelf] = useState<NewsItem[]>([]); // rising stories picked once from the first page
  const [cols, setCols] = useState(1); // grid columns right now: the shelf goes after the first row

  const cursor = useRef(0); // feed: server offset; search: page index
  const seed = useRef<number | null>(null); // one order per visit; set on first load
  const busy = useRef(false);
  const ids = useRef(new Set<string>());
  const hidden = useRef<Set<string> | null>(null);
  const pendingSeen = useRef(new Set<string>());
  const sentinel = useRef<HTMLDivElement | null>(null);
  const cardObserver = useRef<IntersectionObserver | null>(null);
  const gridObserver = useRef<ResizeObserver | null>(null);
  const shelfDecided = useRef(false);
  const isSearch = query.length > 0;

  /** First search page: show what the quick platforms found right away, then swap in the full page. */
  const firstSearchPage = useCallback(async () => {
    const quick = await searchNews(query, filter, 0, sort, true);
    if (!quick.partial) return quick;
    setItems(quick.items);
    setPending(quick.pending ?? []);
    const full = await searchNews(query, filter, 0, sort);
    setPending([]);
    setItems([]); // batched with the full page's items below, so the quick ones never blink out
    return full;
  }, [query, filter, sort]);

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    hidden.current ??= includeSeen || isSearch ? new Set() : new Set(loadSeen().keys());
    seed.current ??= newSeed();
    try {
      for (let attempt = 0; attempt < MAX_EMPTY_PAGES; attempt += 1) {
        const page = !isSearch
          ? await getFeed(filter, cursor.current, PAGE_SIZE, seed.current, sort)
          : cursor.current === 0
            ? await firstSearchPage()
            : await searchNews(query, filter, cursor.current, sort);
        cursor.current += isSearch ? 1 : page.items.length;
        if ("errors" in page && attempt === 0 && cursor.current === 1) setSearchErrors(page.errors);
        // check and record in one step, so a repeat inside a page or from an overlapping load is dropped too
        const unique = page.items.filter((i) => !ids.current.has(i.id) && Boolean(ids.current.add(i.id)));
        const visible = unique.filter((i) => !hidden.current!.has(i.id));
        setHiddenCount((n) => n + unique.length - visible.length);
        setItems((prev) => [...prev, ...visible]);
        if (!shelfDecided.current && visible.length > 0) {
          shelfDecided.current = true; // decided once, so the shelf never pops in above where the reader is
          const rising = visible.filter((i) => i.rising && safeUrl(i.thumbnail));
          if (rising.length >= SHELF_MIN) setShelf(rising.slice(0, SHELF_MAX));
        }
        setHasMore(page.hasMore && page.items.length > 0);
        setError(null);
        if (visible.length > 0 || !page.hasMore || page.items.length === 0) break;
      }
    } catch (err) {
      setPending([]);
      setError(err instanceof Error ? err.message : "Could not load stories.");
    } finally {
      busy.current = false;
    }
  }, [filter, sort, query, includeSeen, isSearch, firstSearchPage]);

  // Load the next page whenever the bottom sentinel comes near the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore().then(() => {
          // still visible after loading (short page / tall screen): keep going
          if (el.getBoundingClientRect().top < window.innerHeight + 1200) void loadMore();
        });
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore, error, items.length]);

  // Remember which stories have actually been on screen.
  useEffect(() => {
    if (isSearch) return;
    const flush = () => {
      if (pendingSeen.current.size === 0) return;
      recordSeen(pendingSeen.current);
      pendingSeen.current.clear();
    };
    const id = setInterval(flush, SEEN_FLUSH_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", flush);
      flush();
      cardObserver.current?.disconnect();
    };
  }, [isSearch]);

  const observeCard = useCallback(
    (el: HTMLElement | null) => {
      if (!el || isSearch) return;
      cardObserver.current ??= new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.id;
            if (e.isIntersecting && id) {
              pendingSeen.current.add(id);
              cardObserver.current?.unobserve(e.target);
            }
          }
        },
        { threshold: SEEN_VISIBLE_RATIO },
      );
      cardObserver.current.observe(el);
      return () => cardObserver.current?.unobserve(el);
    },
    [isSearch],
  );

  // Count the grid's columns as it resizes, so the shelf sits after the first row in reading order too.
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    gridObserver.current?.disconnect();
    if (!el) return;
    gridObserver.current = new ResizeObserver(() => setCols(getComputedStyle(el).gridTemplateColumns.split(" ").length));
    gridObserver.current.observe(el);
  }, []);

  const shelfIds = useMemo(() => new Set(shelf.map((i) => i.id)), [shelf]);
  const gridItems = shelf.length > 0 ? items.filter((i) => !shelfIds.has(i.id)) : items;
  const shelfAfter = Math.min(cols, gridItems.length) - 1;

  const initialLoading = items.length === 0 && hasMore && !error;
  const caughtUp = !hasMore && !isSearch && hiddenCount > 0;

  return (
    <>
      {isSearch && searchErrors.length > 0 && (
        <details className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          <summary>Not searched: {searchErrors.map((e) => PLATFORM_LABEL[e.platform]).join(", ")}</summary>
          <ul>
            {searchErrors.map((e) => (
              <li key={e.platform}>
                <strong>{PLATFORM_LABEL[e.platform]}:</strong> {e.error}
              </li>
            ))}
          </ul>
        </details>
      )}

      {initialLoading && (
        <div className={GRID} aria-busy="true" aria-label="Loading stories">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <h2 className={isSearch ? "mb-4 text-[15px] font-medium text-zinc-300" : "sr-only"}>{heading}</h2>
          {pending.length > 0 && (
            <p className="-mt-2 mb-4 text-xs text-zinc-500 motion-safe:animate-pulse" aria-live="polite">
              Still searching {pending.map((p) => PLATFORM_LABEL[p]).join(", ")}…
            </p>
          )}
          <div ref={gridRef} className={GRID}>
            {gridItems.map((item, i) => (
              <Fragment key={item.id}>
                <NewsCard item={item} now={now} fresh={false} cardRef={observeCard} onPlayingChange={onPlayingChange} />
                {i === shelfAfter && shelf.length > 0 && <RisingShelf items={shelf} now={now} />}
              </Fragment>
            ))}
          </div>
        </>
      )}

      <div ref={sentinel} className="py-12 text-center text-sm text-zinc-400" aria-live="polite">
        {error ? (
          <p>
            {error}{" "}
            <button type="button" className="font-semibold text-zinc-100 underline underline-offset-4 hover:text-white" onClick={() => { setError(null); void loadMore(); }}>
              Try again
            </button>
          </p>
        ) : hasMore ? (
          items.length > 0 && (
            <>
              <div className={`${GRID} text-left`}>
                {Array.from({ length: 3 }, (_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
              <p className="sr-only">Loading more stories…</p>
            </>
          )
        ) : caughtUp ? (
          <p>
            You are all caught up. {hiddenCount} stories you already saw are hidden.{" "}
            <button type="button" className="font-semibold text-zinc-100 underline underline-offset-4 hover:text-white" onClick={onShowSeen}>
              Show them
            </button>
          </p>
        ) : (
          <p>{items.length === 0 ? (isSearch ? "No stories match that search yet." : "No stories yet. The server checks again in a few minutes.") : "That is everything for now. New stories appear at the top as they arrive."}</p>
        )}
      </div>
    </>
  );
}
