"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import { timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, fixHint, type Filter, type Platform, type Sort } from "@/lib/types";
import { useLiveStatus, type ConnectionStatus } from "@/lib/useLiveStatus";
import { useNow } from "@/lib/useNow";

import { FeedList } from "./FeedList";
import { ACCENT, FOCUS } from "./platformStyle";

const AUTO_REFRESH_SCROLL_PX = 300; // new stories slide in by themselves only when you are near the top

const GLASS = "border border-white/10 bg-white/[0.06] backdrop-blur-xl";
const CHIP = `inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white aria-pressed:border-white/30 aria-pressed:bg-white/15 aria-pressed:text-white ${GLASS} ${FOCUS}`;
const DOT: Record<"wait" | "busy" | "down" | "ok", string> = {
  wait: "bg-zinc-500",
  busy: "bg-amber-400 motion-safe:animate-pulse",
  down: "bg-live",
  ok: "bg-emerald-400",
};
const LIVE_DOT: Record<ConnectionStatus, string> = {
  connecting: "bg-amber-400",
  live: "bg-live motion-safe:animate-pulse",
  reconnecting: "bg-amber-400 motion-safe:animate-pulse",
};

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

export function Feed() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("hot");
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
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-8">
      <header className={`sticky top-3 z-20 mt-3 mb-8 rounded-3xl px-4 py-4 shadow-2xl shadow-black/40 sm:px-6 ${GLASS}`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="bg-linear-to-r from-white to-zinc-400 bg-clip-text font-serif text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Active News
          </h1>
          <form className="order-last flex w-full min-w-0 items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 focus-within:border-white/30 md:order-none md:w-auto md:flex-1" role="search" onSubmit={submitSearch}>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search any topic or question…"
              aria-label="Search every platform"
              maxLength={120}
              className="min-w-0 flex-1 bg-transparent px-4 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            {query && (
              <button type="button" onClick={clearSearch} aria-label="Clear search" className={`rounded-full px-2 text-lg text-zinc-400 hover:text-white ${FOCUS}`}>
                ×
              </button>
            )}
            <button
              type="submit"
              disabled={!draft.trim()}
              className={`rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-white disabled:bg-white/10 disabled:text-zinc-500 ${FOCUS}`}
            >
              Search
            </button>
          </form>
          <p className="ml-auto flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase" role="status">
            <span aria-hidden="true" className={`size-2 rounded-full ${LIVE_DOT[connection]}`} />
            {STATUS_TEXT[connection]}
            {latestUpdate && <span className="font-normal tracking-normal text-zinc-500 normal-case"> · updated {timeAgo(latestUpdate, now)}</span>}
          </p>
        </div>

        <nav className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Platforms">
          <button type="button" className={CHIP} aria-pressed={sort === "hot"} onClick={() => setSort("hot")} title={query ? "Most relevant and discussed first" : "Most discussed right now"}>
            Hot
          </button>
          <button type="button" className={CHIP} aria-pressed={sort === "latest"} onClick={() => setSort("latest")} title="Newest posts first">
            Latest
          </button>
          <span aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-white/10" />
          <button type="button" className={CHIP} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All platforms
          </button>
          {PLATFORMS.map((p) => {
            const s = statuses[p];
            const state = !s ? "wait" : s.refreshing ? "busy" : s.error && s.count === 0 ? "down" : "ok";
            return (
              <button
                key={p}
                type="button"
                className={CHIP}
                aria-pressed={filter === p}
                title={s?.error ?? (s?.updatedAt ? `Updated ${timeAgo(s.updatedAt, now)}` : "Loading")}
                onClick={() => setFilter(p)}
              >
                <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[state]}`} />
                {PLATFORM_LABEL[p]}
                <span className={`text-xs tabular-nums ${state === "down" ? "text-live" : ACCENT[p].text} opacity-80`}>
                  {state === "down" ? "offline" : (s?.count ?? "…")}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {newCount > 0 && (
        <button
          type="button"
          onClick={showNew}
          className={`sticky top-40 z-10 mx-auto -mt-4 mb-6 block rounded-full px-5 py-2 text-sm font-semibold text-white shadow-xl shadow-black/40 hover:bg-white/20 ${GLASS} ${FOCUS}`}
        >
          ↑ {newCount} new {newCount === 1 ? "story" : "stories"}
        </button>
      )}

      <main>
        {selected?.error && (
          <div role="alert" className="mb-8 rounded-2xl border border-live/30 bg-live/10 px-5 py-4 text-sm text-zinc-200 backdrop-blur-xl">
            <strong className="text-white">{PLATFORM_LABEL[selected.platform]} could not be reached.</strong> {fixHint(selected.error) ?? ""}
            <details className="mt-2">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Details</summary>
              <code className="mt-2 block font-mono text-xs break-all whitespace-pre-wrap text-zinc-400">{selected.error}</code>
            </details>
            {selected.count > 0 && <p className="mt-2 text-zinc-400">Showing the stories collected before it failed.</p>}
          </div>
        )}

        <FeedList
          key={`${filter}|${sort}|${query}|${includeSeen}|${version}`}
          filter={filter}
          sort={sort}
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
