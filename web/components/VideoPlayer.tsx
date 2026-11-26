"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from many external hosts */
import { useState } from "react";

import { isYoutubeId, safeUrl } from "@/lib/format";
import type { Video } from "@/lib/types";

import { FOCUS } from "./platformStyle";

interface VideoPlayerProps {
  video: Video;
  thumbnail: string | null;
  title: string;
  onPlayingChange: (playing: boolean) => void;
}

export const MEDIA = "block aspect-video w-full overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10";

export function VideoPlayer({ video, thumbnail, title, onPlayingChange }: VideoPlayerProps) {
  const [open, setOpen] = useState(false);
  const poster = safeUrl(thumbnail);

  if (video.kind === "file") {
    const src = safeUrl(video.url);
    if (!src) return null;
    return (
      <video
        className={`${MEDIA} object-contain`}
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
        className={`${MEDIA} group relative cursor-pointer ${FOCUS}`}
        aria-label={`Play video: ${title}`}
        onClick={() => {
          setOpen(true);
          onPlayingChange(true);
        }}
      >
        {poster && (
          <img src={poster} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105" />
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 m-auto grid h-12 w-16 place-items-center rounded-2xl border border-white/20 bg-white/15 text-xl text-white shadow-lg backdrop-blur-md transition group-hover:bg-youtube/90"
        >
          ▶
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <iframe
        className={MEDIA}
        src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      {/* overlays the player so opening a video never changes the story's height */}
      <button
        type="button"
        className={`absolute top-2 right-2 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md hover:bg-black/80 ${FOCUS}`}
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
