"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { suggestNews } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, TOPICS, fixHint, type Filter, type Platform, type Sort, type Suggestion } from "@/lib/types";
import { useLiveStatus, type ConnectionStatus } from "@/lib/useLiveStatus";
import { useNow } from "@/lib/useNow";

import { FeedList } from "./FeedList";
import { ArrowUpIcon, CloseIcon, LogoMark, MenuIcon, SearchIcon } from "./icons";
import { FOCUS } from "./platformStyle";
import { ScrollRow } from "./ScrollRow";
import { Sidebar } from "./Sidebar";

const AUTO_REFRESH_SCROLL_PX = 300; // new stories slide in by themselves only when you are near the top
const WIDE_GUIDE = "(min-width: 64rem)"; // Tailwind `lg`: the guide is docked from here up, a drawer below
const SUGGEST_DEBOUNCE_MS = 150; // one pool scan per typing pause, not per keystroke
const SUGGEST_MIN_CHARS = 2;

const GLASS = "border border-white/10 bg-white/[0.06] backdrop-blur-xl";
const CHIP = `inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap text-zinc-300 transition-colors hover:bg-white/10 hover:text-white aria-pressed:border-white/30 aria-pressed:bg-white/15 aria-pressed:text-white ${GLASS} ${FOCUS}`;
const ICON_BUTTON = `grid size-10 shrink-0 place-items-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 hover:text-white ${FOCUS}`;

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

function Wordmark({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Active News home" className={`flex items-center gap-2 rounded-md px-1 py-1 ${FOCUS}`}>
      <LogoMark className="size-7" />
      <span className="hidden font-serif text-xl font-bold tracking-tight text-white sm:inline">Active News</span>
    </button>
  );
}

export function Feed() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("hot");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null); // label of the topic chip behind `query`, if any
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1); // highlighted suggestion while the list is open
  const [includeSeen, setIncludeSeen] = useState(false);
  const [version, setVersion] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const playingIds = useRef(new Set<string>());
  const queryRef = useRef(query);
  const sugTimer = useRef<number | null>(null);
  const sugAbort = useRef<AbortController | null>(null);
  const now = useNow();

  // no suggestion fetch may outlive this component
  useEffect(
    () => () => {
      if (sugTimer.current !== null) clearTimeout(sugTimer.current);
      sugAbort.current?.abort();
    },
    [],
  );

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

  const runQuery = (next: string, label: string | null) => {
    if (sugTimer.current !== null) clearTimeout(sugTimer.current);
    sugAbort.current?.abort();
    setSugs([]);
    setActive(-1);
    queryRef.current = next;
    setQuery(next);
    setTopic(label);
    window.scrollTo({ top: 0 });
  };

  /** While typing: ask the collected pool for titles that continue these words, debounced and abortable. */
  const onDraftChange = (value: string) => {
    setDraft(value);
    if (sugTimer.current !== null) clearTimeout(sugTimer.current);
    sugAbort.current?.abort();
    const q = value.trim();
    if (q.length < SUGGEST_MIN_CHARS) {
      setSugs([]);
      setActive(-1);
      return;
    }
    sugTimer.current = window.setTimeout(() => {
      const ac = new AbortController();
      sugAbort.current = ac;
      suggestNews(q, filter, ac.signal)
        .then((res) => {
          setSugs(res.suggestions);
          setActive(-1);
        })
        .catch(() => undefined); // aborted or failed: the list just stays as it is, submitting still works
    }, SUGGEST_DEBOUNCE_MS);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (sugs.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % sugs.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + sugs.length) % sugs.length);
    } else if (e.key === "Escape") {
      setSugs([]);
      setActive(-1);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // pick the highlighted suggestion instead of submitting the raw draft
      pickSuggestion(sugs[active]);
    }
  };

  const pickSuggestion = (s: Suggestion) => {
    setDraft(s.title);
    runQuery(s.title, null);
    setSort("hot");
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    runQuery(draft.trim(), null);
    setSort("hot"); // searches open best match first, like YouTube; newest junk uploads otherwise lead
  };

  const clearSearch = () => {
    setDraft("");
    runQuery("", null);
    setSort("hot");
  };

  const pickTopic = (t: (typeof TOPICS)[number]) => {
    setDraft("");
    runQuery(t.query, t.label);
  };

  const closeDrawer = () => drawer.current?.close();
  const goHome = () => {
    setFilter("all");
    clearSearch();
    closeDrawer();
  };
  const toggleGuide = () => {
    if (window.matchMedia(WIDE_GUIDE).matches) setGuideCollapsed((c) => !c);
    else drawer.current?.showModal();
  };

  const showNew = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    reload();
  };

  const selected = filter === "all" ? undefined : statuses[filter];
  const latestUpdate = Object.values(statuses).map((s) => s?.updatedAt).filter(Boolean).sort().at(-1) ?? null;
  const heading = topic
    ? `${topic}${sort === "latest" ? ", newest first" : ""}`
    : query
      ? `${sort === "latest" ? "Newest results" : "Results"} for “${query}”`
      : sort === "latest"
        ? "Newest first"
        : "Being discussed";

  // the docked guide and the drawer share these handlers: closing a drawer that is not open does nothing
  const guide = (mini: boolean) => (
    <Sidebar
      mini={mini}
      isHome={filter === "all" && !query}
      filter={filter}
      sort={sort}
      statuses={statuses}
      now={now}
      onHome={goHome}
      onSort={(s) => {
        setSort(s);
        closeDrawer();
      }}
      onFilter={(p) => {
        setFilter(p);
        closeDrawer();
      }}
    />
  );

  return (
    <>
      <a href="#stories" className="sr-only rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
        Skip to stories
      </a>

      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 bg-ink/85 px-2 backdrop-blur-xl sm:gap-4 sm:px-4">
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" className={ICON_BUTTON} aria-label="Menu" onClick={toggleGuide}>
            <MenuIcon className="size-6" />
          </button>
          <Wordmark onClick={goHome} />
        </div>

        <form className="relative mx-auto flex h-10 max-w-160 min-w-0 flex-1 items-stretch" role="search" onSubmit={submitSearch}>
          <div className="flex min-w-0 flex-1 items-center rounded-l-full border border-white/15 bg-black/40 pl-4 transition-colors focus-within:border-sky-400/70">
            <input
              type="search"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              onBlur={() => {
                setSugs([]);
                setActive(-1);
              }}
              placeholder="Search any topic or question"
              aria-label="Search every platform"
              aria-autocomplete="list"
              aria-expanded={sugs.length > 0}
              aria-controls="search-suggestions"
              aria-activedescendant={active >= 0 ? `sug-${active}` : undefined}
              role="combobox"
              maxLength={120}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-100 outline-none placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {(draft || query) && (
              <button type="button" onClick={clearSearch} aria-label="Clear search" className={`mr-1 grid size-8 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white ${FOCUS}`}>
                <CloseIcon className="size-5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            aria-label="Search"
            disabled={!draft.trim()}
            className={`grid w-14 shrink-0 place-items-center rounded-r-full border border-l-0 border-white/15 bg-white/[0.08] text-zinc-100 transition-colors hover:bg-white/15 disabled:text-zinc-500 disabled:hover:bg-white/[0.08] sm:w-16 ${FOCUS}`}
          >
            <SearchIcon className="size-5" />
          </button>
          {sugs.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              aria-label="Search suggestions"
              className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 py-1 shadow-xl shadow-black/50"
            >
              {sugs.map((s, i) => (
                <li
                  key={`${s.platform}-${i}`}
                  id={`sug-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()} // keep the input's focus, so blur does not close the list first
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pickSuggestion(s)}
                  className={`flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm ${i === active ? "bg-white/10 text-white" : "text-zinc-200"}`}
                >
                  <SearchIcon className="size-3.5 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{PLATFORM_LABEL[s.platform]}</span>
                </li>
              ))}
            </ul>
          )}
        </form>

        <p className="flex shrink-0 items-center gap-2 pr-1 text-xs font-semibold tracking-wider text-zinc-300 uppercase" role="status">
          <span aria-hidden="true" className={`size-2 rounded-full ${LIVE_DOT[connection]}`} />
          <span className="sr-only sm:not-sr-only">{STATUS_TEXT[connection]}</span>
          {latestUpdate && <span className="hidden font-normal tracking-normal text-zinc-500 normal-case xl:inline">· updated {timeAgo(latestUpdate, now)}</span>}
        </p>
      </header>

      <aside
        className={`fixed top-14 bottom-0 left-0 z-20 hidden overflow-y-auto overscroll-contain bg-ink [scrollbar-width:none] hover:[scrollbar-width:thin] lg:block ${guideCollapsed ? "w-18" : "w-60"}`}
      >
        {guide(guideCollapsed)}
      </aside>

      <dialog
        ref={drawer}
        aria-label="Guide"
        onClick={(e) => e.target === e.currentTarget && closeDrawer()}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-64 max-w-[85vw] overflow-y-auto border-r border-white/10 bg-ink p-0 text-zinc-100 backdrop:bg-black/60"
      >
        <div className="flex h-14 items-center gap-2 px-2">
          <button type="button" className={ICON_BUTTON} aria-label="Close menu" onClick={closeDrawer}>
            <MenuIcon className="size-6" />
          </button>
          <Wordmark onClick={goHome} />
        </div>
        {guide(false)}
      </dialog>

      <div className={`pt-14 ${guideCollapsed ? "lg:pl-18" : "lg:pl-60"}`}>
        <div className="sticky top-14 z-10 bg-ink/85 px-4 py-3 backdrop-blur-xl sm:px-6">
          <ScrollRow label="topics" className="flex gap-3">
            <button type="button" className={CHIP} aria-pressed={!query} onClick={clearSearch}>
              All
            </button>
            {TOPICS.map((t) => (
              <button key={t.label} type="button" className={CHIP} aria-pressed={topic === t.label} onClick={() => pickTopic(t)}>
                {t.label}
              </button>
            ))}
          </ScrollRow>
        </div>

        <main id="stories" className="px-4 pt-3 pb-16 sm:px-6">
          {newCount > 0 && (
            <button
              type="button"
              onClick={showNew}
              className={`sticky top-31 z-10 mx-auto mb-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-xl shadow-black/40 hover:bg-white/20 ${GLASS} ${FOCUS}`}
            >
              <ArrowUpIcon className="size-4" />
              {newCount} new {newCount === 1 ? "story" : "stories"}
            </button>
          )}

          {selected?.error && (
            <div role="alert" className="mb-6 rounded-xl border border-live/30 bg-live/10 px-5 py-4 text-sm text-zinc-200">
              <strong className="text-white">{PLATFORM_LABEL[selected.platform]} could not be reached.</strong> {fixHint(selected.error, selected.platform) ?? ""}
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
            heading={heading}
            includeSeen={includeSeen}
            now={now}
            onPlayingChange={onPlayingChange}
            onShowSeen={() => setIncludeSeen(true)}
          />
        </main>
      </div>
    </>
  );
}
