"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { memo } from "react";

import { compact, safeUrl, timeAgo } from "@/lib/format";
import { PLATFORM_LABEL, type NewsItem } from "@/lib/types";

import styles from "./news.module.css";
import { VideoPlayer } from "./VideoPlayer";

interface NewsCardProps {
  item: NewsItem;
  now: number | null;
  fresh: boolean;
  lead?: boolean;
  /** Called with the card element, e.g. to track which stories were on screen. */
  cardRef?: (el: HTMLElement | null) => void | (() => void);
  onPlayingChange: (id: string, playing: boolean) => void;
}

function Metrics({ item }: { item: NewsItem }) {
  const { score, comments, views } = item.metrics;
  const parts = [
    views ? `${compact(views)} views` : null,
    score ? `${compact(score)} ${item.platform === "twitter" ? "likes" : "points"}` : null,
    comments ? `${compact(comments)} ${item.platform === "4chan" ? "replies" : "comments"}` : null,
  ].filter(Boolean);
  return parts.length ? <span>{parts.join(" · ")}</span> : null;
}

function NewsCardImpl({ item, now, fresh, lead = false, cardRef, onPlayingChange }: NewsCardProps) {
  const href = safeUrl(item.url);
  const discuss = safeUrl(item.discussionUrl);
  const age = timeAgo(item.publishedAt, now);
  const thumb = safeUrl(item.thumbnail);

  return (
    <article
      ref={cardRef}
      className={`${styles.card} ${lead ? styles.lead : ""} ${fresh ? styles.fresh : ""}`}
      data-platform={item.platform}
      data-id={item.id}
    >
      <header className={styles.cardTop}>
        <span className={styles.badge}>{PLATFORM_LABEL[item.platform]}</span>
        {item.rising && <span className={styles.rising}>▲ Rising</span>}
        {fresh && <span className={styles.newTag}>New</span>}
        <span className={styles.heat} title={`Heat ${item.heat}/100: how fast this is being discussed compared with the rest of ${PLATFORM_LABEL[item.platform]}`}>
          <span className={styles.heatBar} style={{ inlineSize: `${item.heat}%` }} />
        </span>
      </header>

      <h3 className={styles.title}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {item.title}
        </a>
      </h3>

      {item.video ? (
        <VideoPlayer
          video={item.video}
          thumbnail={item.thumbnail}
          title={item.title}
          onPlayingChange={(playing) => onPlayingChange(item.id, playing)}
        />
      ) : (
        thumb && <img className={`${styles.media} ${styles.thumb}`} src={thumb} alt="" loading="lazy" />
      )}

      {item.description && <p className={styles.desc}>{item.description}</p>}

      <footer className={styles.meta}>
        {item.author && <span>{item.author}</span>}
        {age && <time dateTime={item.publishedAt ?? undefined}>{age}</time>}
        <Metrics item={item} />
        {discuss && (
          <a href={discuss} target="_blank" rel="noopener noreferrer">
            Discussion
          </a>
        )}
      </footer>
    </article>
  );
}

export const NewsCard = memo(NewsCardImpl);
