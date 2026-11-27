import type { ReactNode } from "react";

import { timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, type Filter, type Platform, type SourceStatus, type Sort } from "@/lib/types";

import { ClockIcon, FlameIcon, HomeIcon } from "./icons";
import { ACCENT, FOCUS, MARK } from "./platformStyle";

type State = "wait" | "busy" | "down" | "ok";

const DOT: Record<State, string> = {
  wait: "bg-zinc-500",
  busy: "bg-amber-400 motion-safe:animate-pulse",
  down: "bg-live",
  ok: "bg-emerald-400",
};

const stateOf = (s: SourceStatus | undefined): State => (!s ? "wait" : s.refreshing ? "busy" : s.error && s.count === 0 ? "down" : "ok");

const ROW = `flex h-10 w-full items-center gap-4 rounded-md px-3 text-left text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white aria-pressed:bg-white/10 aria-pressed:font-semibold aria-pressed:text-white ${FOCUS}`;
const MINI_ROW = `flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-3.5 text-[10px] leading-none text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white aria-pressed:bg-white/10 aria-pressed:text-white ${FOCUS}`;

interface SidebarProps {
  mini: boolean;
  isHome: boolean;
  filter: Filter;
  sort: Sort;
  statuses: Partial<Record<Platform, SourceStatus>>;
  now: number | null;
  onHome: () => void;
  onSort: (sort: Sort) => void;
  onFilter: (platform: Platform) => void;
}

function Avatar({ platform, state }: { platform: Platform; state: State }) {
  return (
    <span aria-hidden="true" className={`relative grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-1 ring-white/10 ${ACCENT[platform].tint} ${ACCENT[platform].text}`}>
      {MARK[platform]}
      <span className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-ink ${DOT[state]}`} />
    </span>
  );
}

function Group({ title, mini, children }: { title?: string; mini: boolean; children: ReactNode }) {
  return (
    <div className={`border-white/[0.08] py-3 not-first:border-t ${mini ? "px-1" : "px-3"}`}>
      {title && !mini && <h2 className="px-3 pt-1 pb-2 text-base font-semibold text-zinc-100">{title}</h2>}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

/** YouTube-style guide: Home, sort, then platforms in place of subscriptions. `mini` is the narrow icon rail. */
export function Sidebar({ mini, isHome, filter, sort, statuses, now, onHome, onSort, onFilter }: SidebarProps) {
  const row = mini ? MINI_ROW : ROW;
  const icon = "size-6 shrink-0";
  return (
    <nav aria-label="Guide" className="pb-6">
      <Group mini={mini}>
        <li>
          <button type="button" className={row} aria-pressed={isHome} onClick={onHome} title="Every platform, every topic">
            <HomeIcon className={icon} />
            Home
          </button>
        </li>
      </Group>
      <Group title="Sort by" mini={mini}>
        <li>
          <button type="button" className={row} aria-pressed={sort === "hot"} onClick={() => onSort("hot")} title="Most discussed right now">
            <FlameIcon className={icon} />
            Hot
          </button>
        </li>
        <li>
          <button type="button" className={row} aria-pressed={sort === "latest"} onClick={() => onSort("latest")} title="Newest posts first">
            <ClockIcon className={icon} />
            Latest
          </button>
        </li>
      </Group>
      <Group title="Platforms" mini={mini}>
        {PLATFORMS.map((p) => {
          const s = statuses[p];
          const state = stateOf(s);
          const detail = s?.error ?? (s?.updatedAt ? `Updated ${timeAgo(s.updatedAt, now)}` : "Loading");
          return (
            <li key={p}>
              <button type="button" className={row} aria-pressed={filter === p} onClick={() => onFilter(p)} title={`${PLATFORM_LABEL[p]}: ${detail}`}>
                <Avatar platform={p} state={state} />
                {mini ? (
                  <span className="max-w-full truncate">{PLATFORM_LABEL[p].split(" ")[0]}</span>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{PLATFORM_LABEL[p]}</span>
                    <span className={`text-xs font-normal tabular-nums ${state === "down" ? "text-live" : "text-zinc-500"}`}>
                      {state === "down" ? "retrying" : (s?.count ?? "…")}
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </Group>
    </nav>
  );
}
