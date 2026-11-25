"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getFeed, newSeed, searchNews } from "@/lib/api";
import { loadSeen, recordSeen } from "@/lib/seen";
import { PLATFORM_LABEL, type Filter, type NewsItem, type SearchPage } from "@/lib/types";

import styles from "./news.module.css";
import { NewsCard } from "./NewsCard";

const PAGE_SIZE = 30;
const MAX_EMPTY_PAGES = 5; // stop auto-skipping after this many pages of already-seen stories
const SEEN_FLUSH_MS = 3000;
const SEEN_VISIBLE_RATIO = 0.6;

interface FeedListProps {
  filter: Filter;
  query: string; // empty = live feed, otherwise search
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
export function FeedList({ filter, query, includeSeen, now, onPlayingChange, onShowSeen }: FeedListProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [searchErrors, setSearchErrors] = useState<SearchPage["errors"]>([]);

  const cursor = useRef(0); // feed: server offset; search: page index
  const seed = useRef<number | null>(null); // one order per visit; set on first load
  const busy = useRef(false);
  const ids = useRef(new Set<string>());
  const hidden = useRef<Set<string> | null>(null);
  const pendingSeen = useRef(new Set<string>());
  const sentinel = useRef<HTMLDivElement | null>(null);
  const cardObserver = useRef<IntersectionObserver | null>(null);
  const isSearch = query.length > 0;

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    hidden.current ??= includeSeen || isSearch ? new Set() : new Set(loadSeen().keys());
    seed.current ??= newSeed();
    try {
      for (let attempt = 0; attempt < MAX_EMPTY_PAGES; attempt += 1) {
        const page = isSearch ? await searchNews(query, filter, cursor.current) : await getFeed(filter, cursor.current, PAGE_SIZE, seed.current);
        cursor.current += isSearch ? 1 : page.items.length;
        if ("errors" in page && attempt === 0 && cursor.current === 1) setSearchErrors(page.errors);
        const unique = page.items.filter((i) => !ids.current.has(i.id));
        unique.forEach((i) => ids.current.add(i.id));
        const visible = unique.filter((i) => !hidden.current!.has(i.id));
        setHiddenCount((n) => n + unique.length - visible.length);
        setItems((prev) => [...prev, ...visible]);
        setHasMore(page.hasMore && page.items.length > 0);
        setError(null);
        if (visible.length > 0 || !page.hasMore || page.items.length === 0) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stories.");
    } finally {
      busy.current = false;
    }
  }, [filter, query, includeSeen, isSearch]);

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

  const [lead, ...rest] = items;
  const initialLoading = items.length === 0 && hasMore && !error;
  const caughtUp = !hasMore && !isSearch && hiddenCount > 0;

  return (
    <>
      {isSearch && searchErrors.length > 0 && (
        <details className={styles.searchErrors}>
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
        <div className={styles.grid} aria-busy="true" aria-label="Loading stories">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`${styles.card} ${styles.skeleton}`} />
          ))}
        </div>
      )}

      {lead && !isSearch && (
        <section aria-label="Hottest right now" className={styles.leadWrap}>
          <h2 className={styles.sectionLabel}>{filter === "all" ? "Hottest right now" : `Top on ${PLATFORM_LABEL[filter]}`}</h2>
          <NewsCard item={lead} now={now} fresh={false} lead cardRef={observeCard} onPlayingChange={onPlayingChange} />
        </section>
      )}

      {items.length > 0 && (
        <>
          <h2 className={styles.sectionLabel}>{isSearch ? `Results for “${query}”` : "Being discussed"}</h2>
          <div className={styles.grid}>
            {(isSearch ? items : rest).map((item) => (
              <NewsCard key={item.id} item={item} now={now} fresh={false} cardRef={observeCard} onPlayingChange={onPlayingChange} />
            ))}
          </div>
        </>
      )}

      <div ref={sentinel} className={styles.footer} aria-live="polite">
        {error ? (
          <p>
            {error}{" "}
            <button type="button" className={styles.linkButton} onClick={() => { setError(null); void loadMore(); }}>
              Try again
            </button>
          </p>
        ) : hasMore ? (
          items.length > 0 && <p className={styles.loadingMore}>Loading more stories…</p>
        ) : caughtUp ? (
          <p>
            You are all caught up. {hiddenCount} stories you already saw are hidden.{" "}
            <button type="button" className={styles.linkButton} onClick={onShowSeen}>
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
