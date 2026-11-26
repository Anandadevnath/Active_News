"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { memo, useState } from "react";

import { compact, safeUrl, timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, type NewsItem } from "@/lib/types";

import { ACCENT } from "./platformStyle";
import { MEDIA, VideoPlayer } from "./VideoPlayer";

interface NewsCardProps {
  item: NewsItem;
  now: number | null;
  fresh: boolean;
  /** Called with the card element, e.g. to track which stories were on screen. */
  cardRef?: (el: HTMLElement | null) => void | (() => void);
  onPlayingChange: (id: string, playing: boolean) => void;
}

function metricsText(item: NewsItem): string {
  const { score, comments, views } = item.metrics;
  return [
    views ? `${compact(views)} views` : null,
    score ? `${compact(score)} ${item.platform === "twitter" ? "likes" : "points"}` : null,
    comments ? `${compact(comments)} ${item.platform === "4chan" ? "replies" : "comments"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function NewsCardImpl({ item, now, fresh, cardRef, onPlayingChange }: NewsCardProps) {
  const href = safeUrl(item.url);
  const discuss = safeUrl(item.discussionUrl);
  const age = timeAgo(item.publishedAt, now);
  const [imageFailed, setImageFailed] = useState(false); // hotlink-protected images: fall back to the text view
  const thumb = imageFailed ? undefined : safeUrl(item.thumbnail);
  const accent = ACCENT[item.platform];
  const metrics = metricsText(item);
  const hasMedia = Boolean(item.video || thumb);
  const linkHost = href ? new URL(href).hostname.replace(/^www\./, "") : null;
  const host = item.platform === "news" && item.author ? item.author : linkHost; // Google News links all go through news.google.com: name the publisher

  return (
    // No box: a thin platform-colored rule separates stories; every slot has a fixed size so all stories match.
    <article
      ref={cardRef}
      className={`flex min-w-0 flex-col gap-3 border-t-2 pt-3 ${accent.border} ${fresh ? "outline-2 outline-offset-4 outline-live" : ""}`}
      data-platform={item.platform}
      data-id={item.id}
    >
      <header className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
        <span className={accent.text}>{PLATFORM_LABEL[item.platform]}</span>
        {item.rising && <span className="text-rising">▲ Rising</span>}
        {fresh && <span className="rounded bg-live px-1.5 py-px text-white">New</span>}
        <span
          className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-white/10"
          title={`Heat ${item.heat}/100: how fast this is being discussed compared with the rest of ${PLATFORM_LABEL[item.platform]}`}
        >
          <span className="block h-full rounded-full bg-linear-to-r from-amber-400 to-live" style={{ inlineSize: `${item.heat}%` }} />
        </span>
      </header>

      {/* Show only what the platform gives: video, else image, else the post's own text in the same 16:9 slot. */}
      {item.video ? (
        <VideoPlayer
          video={item.video}
          thumbnail={item.thumbnail}
          title={item.title}
          onPlayingChange={(playing) => onPlayingChange(item.id, playing)}
        />
      ) : thumb ? (
        <img className={`${MEDIA} object-cover`} src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
      ) : (
        <div className={`aspect-video w-full overflow-hidden border-l-2 pl-4 ${accent.border}`}>
          {item.description ? (
            <p className="h-full text-[15px] leading-relaxed text-zinc-300 mask-b-from-55% [overflow-wrap:anywhere]">{item.description}</p>
          ) : (
            <p className="flex h-full items-center text-sm text-zinc-500">{host ? `Link to ${host}` : "No preview from this platform"}</p>
          )}
        </div>
      )}

      <h3 className="line-clamp-3 min-h-[3.75em] font-serif text-[19px] leading-[1.25] font-semibold text-zinc-50 [overflow-wrap:anywhere]">
        <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-400/80">
          {item.title}
        </a>
      </h3>

      {/* fixed 2-line slot: the description, or for text-only stories (text is shown above) the source site */}
      <p className="line-clamp-2 min-h-[3.25em] text-sm leading-relaxed text-zinc-400 [overflow-wrap:anywhere]">
        {hasMedia ? item.description : host && <span className="text-zinc-500">↗ {host}</span>}
      </p>

      <footer className="mt-auto box-content flex h-4 gap-3 overflow-hidden border-t border-dashed border-white/10 pt-2 text-xs leading-4 whitespace-nowrap text-zinc-500">
        {item.author && <span className="min-w-0 truncate">{item.author}</span>}
        {age && (
          <time className="shrink-0" dateTime={item.publishedAt ?? undefined}>
            {age}
          </time>
        )}
        {metrics && <span className="shrink-0">{metrics}</span>}
        {discuss && (
          <a href={discuss} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-zinc-200 hover:text-white">
            Discussion
          </a>
        )}
      </footer>
    </article>
  );
}

export const NewsCard = memo(NewsCardImpl);
