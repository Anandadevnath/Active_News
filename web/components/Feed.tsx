"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import { timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, fixHint, type Filter, type Platform } from "@/lib/types";
import { useLiveStatus, type ConnectionStatus } from "@/lib/useLiveStatus";
import { useNow } from "@/lib/useNow";

import { FeedList } from "./FeedList";
import styles from "./news.module.css";

const AUTO_REFRESH_SCROLL_PX = 300; // new stories slide in by themselves only when you are near the top

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

export function Feed() {
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [includeSeen, setIncludeSeen] = useState(false);
  const [version, setVersion] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const playingIds = useRef(new Set<string>());
  const queryRef = useRef(query);
  const now = useNow();

  const reload = useCallback(() => {
    setNewCount(0);
    setVersion((v) => v + 1);
  }, []);

  const onNew = useCallback(
    (_platform: Platform, added: number) => {
      const atTop = window.scrollY < AUTO_REFRESH_SCROLL_PX;
      if (atTop && playingIds.current.size === 0 && !queryRef.current) reload();
      else setNewCount((n) => n + added);
    },
    [reload],
  );
  const { statuses, connection } = useLiveStatus(onNew);

  const onPlayingChange = useCallback((id: string, playing: boolean) => {
    if (playing) playingIds.current.add(id);
    else playingIds.current.delete(id);
  }, []);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    queryRef.current = draft.trim();
    setQuery(draft.trim());
    window.scrollTo({ top: 0 });
  };

  const clearSearch = () => {
    setDraft("");
    queryRef.current = "";
    setQuery("");
  };

  const showNew = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    reload();
  };

  const selected = filter === "all" ? undefined : statuses[filter];
  const latestUpdate = Object.values(statuses).map((s) => s?.updatedAt).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brandRow}>
          <h1 className={styles.brand}>Active News</h1>
          <form className={styles.search} role="search" onSubmit={submitSearch}>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search what is being discussed…"
              aria-label="Search news"
              maxLength={120}
            />
            {query && (
              <button type="button" className={styles.clearSearch} onClick={clearSearch} aria-label="Clear search">
                ×
              </button>
            )}
            <button type="submit" disabled={!draft.trim()}>
              Search
            </button>
          </form>
          <p className={styles.live} data-status={connection} role="status">
            <span className={styles.liveDot} aria-hidden="true" />
            {STATUS_TEXT[connection]}
            {latestUpdate && <span className={styles.liveTime}> · updated {timeAgo(latestUpdate, now)}</span>}
          </p>
        </div>

        <nav className={styles.filters} aria-label="Platforms">
          <button type="button" className={styles.chip} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All platforms
          </button>
          {PLATFORMS.map((p) => {
            const s = statuses[p];
            const state = !s ? "wait" : s.refreshing ? "busy" : s.error && s.count === 0 ? "down" : "ok";
            return (
              <button
                key={p}
                type="button"
                className={styles.chip}
                data-state={state}
                aria-pressed={filter === p}
                title={s?.error ?? (s?.updatedAt ? `Updated ${timeAgo(s.updatedAt, now)}` : "Loading")}
                onClick={() => setFilter(p)}
              >
                <span className={styles.chipDot} aria-hidden="true" />
                {PLATFORM_LABEL[p]}
                <span className={styles.chipCount}>{state === "down" ? "offline" : (s?.count ?? "…")}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {newCount > 0 && (
        <button type="button" className={styles.pending} onClick={showNew}>
          ↑ {newCount} new {newCount === 1 ? "story" : "stories"}
        </button>
      )}

      <main>
        {selected?.error && (
          <div className={styles.notice} role="alert">
            <strong>{PLATFORM_LABEL[selected.platform]} could not be reached.</strong> {fixHint(selected.error) ?? ""}
            <details>
              <summary>Details</summary>
              <code>{selected.error}</code>
            </details>
            {selected.count > 0 && <p>Showing the stories collected before it failed.</p>}
          </div>
        )}

        <FeedList
          key={`${filter}|${query}|${includeSeen}|${version}`}
          filter={filter}
          query={query}
          includeSeen={includeSeen}
          now={now}
          onPlayingChange={onPlayingChange}
          onShowSeen={() => setIncludeSeen(true)}
        />
      </main>
    </div>
  );
}
