"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { FOCUS } from "./platformStyle";

const ARROW = `absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-ink/90 text-zinc-200 shadow-lg shadow-black/50 backdrop-blur-xl transition hover:bg-zinc-800 hover:text-white md:grid ${FOCUS}`;

/** A sideways-scrolling row (chips, shelf) with arrow buttons for mouse users; touch and keyboard scroll it natively. */
export function ScrollRow({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="relative min-w-0">
      {!edges.start && (
        <button type="button" aria-label={`Scroll ${label} left`} className={`${ARROW} left-0`} onClick={() => scroll(-1)}>
          <ChevronLeftIcon className="size-5" />
        </button>
      )}
      <div
        ref={row}
        onScroll={measure}
        className={`${className} overflow-x-auto [scrollbar-width:none] ${edges.end ? "" : "mask-r-from-85%"} ${edges.start ? "" : "mask-l-from-85%"}`}
      >
        {children}
      </div>
      {!edges.end && (
        <button type="button" aria-label={`Scroll ${label} right`} className={`${ARROW} right-0`} onClick={() => scroll(1)}>
          <ChevronRightIcon className="size-5" />
        </button>
      )}
    </div>
  );
}
