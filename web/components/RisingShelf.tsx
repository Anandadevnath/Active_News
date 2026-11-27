"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { useState } from "react";

import { safeUrl, timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, type NewsItem } from "@/lib/types";

import { TrendingIcon } from "./icons";
import { metricsText, PlatformAvatar } from "./NewsCard";
import { ACCENT, FOCUS } from "./platformStyle";
import { ScrollRow } from "./ScrollRow";

function ShelfCard({ item, now }: { item: NewsItem; now: number | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = safeUrl(item.url);
  const thumb = imageFailed ? undefined : safeUrl(item.thumbnail);
  const meta = metricsText(item) || timeAgo(item.publishedAt, now);

  return (
    <li className="w-44 shrink-0 snap-start sm:w-52">
      <a href={href} target="_blank" rel="noopener noreferrer" className={`group block rounded-xl ${FOCUS}`}>
        <span className="block aspect-3/4 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10">
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]" />
          ) : (
            <span className={`grid size-full place-items-center ${ACCENT[item.platform].tint}`}>
              <PlatformAvatar item={item} className="size-12 text-sm" />
            </span>
          )}
        </span>
        <span className="mt-2 line-clamp-2 font-serif text-[15px] leading-snug font-semibold text-zinc-50 group-hover:underline group-hover:underline-offset-4 [overflow-wrap:anywhere]">{item.title}</span>
        <span className="mt-1 block truncate text-xs text-zinc-400">
          <span className={ACCENT[item.platform].text}>{PLATFORM_LABEL[item.platform]}</span>
          {meta && ` · ${meta}`}
        </span>
      </a>
    </li>
  );
}

/** A sideways shelf of fast-growing stories after the first grid row (where YouTube puts Shorts). */
export function RisingShelf({ items, now }: { items: NewsItem[]; now: number | null }) {
  return (
    <section aria-labelledby="rising-heading" className="col-span-full min-w-0">
      <h2 id="rising-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-50">
        <TrendingIcon className="size-6 text-rising" />
        Rising now
      </h2>
      <ScrollRow label="rising stories" className="snap-x snap-mandatory">
        <ul className="flex w-max gap-4">
          {items.map((item) => (
            <ShelfCard key={item.id} item={item} now={now} />
          ))}
        </ul>
      </ScrollRow>
    </section>
  );
}
