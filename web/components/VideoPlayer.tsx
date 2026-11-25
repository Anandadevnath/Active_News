"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { useState } from "react";

import { isYoutubeId, safeUrl } from "@/lib/format";
import type { Video } from "@/lib/types";

import styles from "./news.module.css";

interface VideoPlayerProps {
  video: Video;
  thumbnail: string | null;
  title: string;
  onPlayingChange: (playing: boolean) => void;
}

export function VideoPlayer({ video, thumbnail, title, onPlayingChange }: VideoPlayerProps) {
  const [open, setOpen] = useState(false);
  const poster = safeUrl(thumbnail);

  if (video.kind === "file") {
    const src = safeUrl(video.url);
    if (!src) return null;
    return (
      <video
        className={styles.media}
        controls
        preload="none"
        poster={poster}
        src={src}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={() => onPlayingChange(false)}
      />
    );
  }

  if (!isYoutubeId(video.id)) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={`${styles.media} ${styles.ytButton}`}
        aria-label={`Play video: ${title}`}
        onClick={() => {
          setOpen(true);
          onPlayingChange(true);
        }}
      >
        {poster && <img src={poster} alt="" loading="lazy" />}
        <span className={styles.play} aria-hidden="true">
          ▶
        </span>
      </button>
    );
  }

  return (
    <div className={styles.playerWrap}>
      <iframe
        className={styles.media}
        src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <button
        type="button"
        className={styles.closeVideo}
        onClick={() => {
          setOpen(false);
          onPlayingChange(false);
        }}
      >
        Close video
      </button>
    </div>
  );
}
