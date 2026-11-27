"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { memo, useState } from "react";

import { compact, safeUrl, timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, type NewsItem } from "@/lib/types";

import { ChatIcon, ExternalIcon, TrendingIcon } from "./icons";
import { ACCENT, FOCUS, MARK } from "./platformStyle";
import { MEDIA, VideoPlayer } from "./VideoPlayer";

interface NewsCardProps {
  item: NewsItem;
  now: number | null;
  fresh: boolean;
  /** Called with the card element, e.g. to track which stories were on screen. */
  cardRef?: (el: HTMLElement | null) => void | (() => void);
  onPlayingChange: (id: string, playing: boolean) => void;
}

export function metricsText(item: NewsItem): string {
  const { score, comments, views } = item.metrics;
  return [
    views ? `${compact(views)} views` : null,
    score ? `${compact(score)} ${item.platform === "twitter" ? "likes" : "points"}` : null,
    comments ? `${compact(comments)} ${item.platform === "4chan" ? "replies" : "comments"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Where a story links: the publisher for Google News (its links all go through news.google.com), else the link's host. */
export function hostOf(item: NewsItem, href: string | undefined): string | null {
  if (item.platform === "news" && item.author) return item.author;
  return href ? new URL(href).hostname.replace(/^www\./, "") : null;
}

/** Platform monogram in a tinted circle, where YouTube shows the channel avatar. */
export function PlatformAvatar({ item, className }: { item: NewsItem; className: string }) {
  const accent = ACCENT[item.platform];
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-white/10 ${accent.tint} ${accent.text} ${className}`}>
      {MARK[item.platform]}
    </span>
  );
}

function NewsCardImpl({ item, now, fresh, cardRef, onPlayingChange }: NewsCardProps) {
  const href = safeUrl(item.url);
  const discuss = safeUrl(item.discussionUrl);
  const age = timeAgo(item.publishedAt, now);
  const [imageFailed, setImageFailed] = useState(false); // hotlink-protected images: fall back to the text view
  const thumb = imageFailed ? undefined : safeUrl(item.thumbnail);
  const metrics = metricsText(item);
  const host = hostOf(item, href);

  return (
    <article ref={cardRef} className={`flex min-w-0 flex-col gap-3 ${fresh ? "outline-2 outline-offset-4 outline-live" : ""}`} data-platform={item.platform} data-id={item.id}>
      {/* Show only what the platform gives: video, else image, else the post's own text in the same 16:9 slot. */}
      {item.video ? (
        <VideoPlayer video={item.video} thumbnail={item.thumbnail} title={item.title} onPlayingChange={(playing) => onPlayingChange(item.id, playing)} />
      ) : thumb ? (
        <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="group block">
          <img className={`${MEDIA} object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]`} src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        </a>
      ) : (
        <div className={`${MEDIA} p-4`}>
          {item.description ? (
            <p className="h-full text-[15px] leading-relaxed text-zinc-300 mask-b-from-60% [overflow-wrap:anywhere]">{item.description}</p>
          ) : (
            <p className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
              {host ? (
                <>
                  <ExternalIcon className="size-4" /> {host}
                </>
              ) : (
                "No preview from this platform"
              )}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <PlatformAvatar item={item} className="mt-0.5 size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 min-h-[2.5em] font-serif text-[17px] leading-[1.25] font-semibold text-zinc-50 [overflow-wrap:anywhere]">
            <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-400/80">
              {item.title}
            </a>
          </h3>
          <p className="mt-1 truncate text-[13px] text-zinc-400">{item.author || host || PLATFORM_LABEL[item.platform]}</p>
          <p className="flex items-center gap-1.5 truncate text-[13px] whitespace-nowrap text-zinc-400">
            <span className={`font-medium ${ACCENT[item.platform].text}`}>{PLATFORM_LABEL[item.platform]}</span>
            {metrics && <span className="truncate">· {metrics}</span>}
            {age && (
              <time className="shrink-0" dateTime={item.publishedAt ?? undefined}>
                · {age}
              </time>
            )}
          </p>
          <p className="mt-1.5 flex h-4 items-center gap-2 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            {item.rising && (
              <span className="flex items-center gap-1 text-rising">
                <TrendingIcon className="size-3.5" /> Rising
              </span>
            )}
            {fresh && <span className="rounded bg-live px-1.5 py-px text-white">New</span>}
            <span
              className="h-1 w-12 overflow-hidden rounded-full bg-white/10"
              title={`Heat ${item.heat}/100: how fast this is being discussed compared with the rest of ${PLATFORM_LABEL[item.platform]}`}
            >
              <span className="block h-full rounded-full bg-linear-to-r from-amber-400 to-live" style={{ inlineSize: `${item.heat}%` }} />
            </span>
          </p>
        </div>
        {discuss && (
          <a
            href={discuss}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Discussion: ${item.title}`}
            title="Open the discussion"
            className={`-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white ${FOCUS}`}
          >
            <ChatIcon className="size-5" />
          </a>
        )}
      </div>
    </article>
  );
}

export const NewsCard = memo(NewsCardImpl);
