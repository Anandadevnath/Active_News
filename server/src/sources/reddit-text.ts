import { clip, videoFor, youtubeThumb } from "../media.js";
import type { RawItem } from "../types.js";

/**
 * Agent Reach's Reddit search returns each post as markdown:
 *   # Title
 *   Posted by **u/user** in r/sub · 8834 points · 240 comments · October 27, 2026 at 6:58 PM UTC
 *   https://linked-article (link posts only)
 *   post body (text posts only)
 *   ## Top comments ... **u/x** · 1042 points · date \n> comment text
 */
const POSTED_RE = /Posted by \*\*u\/([^*]+)\*\* in r\/(\w+) · (\d+) points · (\d+) comments · ([^\n]+)/;
const URL_LINE_RE = /^https?:\/\/\S+$/;
const COMMENTS_START_RE = /\n(## Top comments|\.\.\.|\*\*u\/)/;
const IMAGE_RE = /\.(jpe?g|png|gif|webp)(\?|$)/i;

export interface RedditPost {
  user: string;
  subreddit: string;
  score: number;
  comments: number;
  publishedAt: string | null;
  linkUrl: string | null;
  body: string;
  topComment: string;
}

function toIso(date: string): string | null {
  const ms = Date.parse(date.replace(" at ", " "));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseRedditText(text: string): RedditPost | null {
  const posted = POSTED_RE.exec(text);
  if (!posted) return null;
  const [, user, subreddit, score, comments, date] = posted;
  const afterHeader = text.slice(posted.index + posted[0].length);
  // The post ends where the comments start: the heading, a "..." gap, or a "**u/name** · N points" line.
  const end = afterHeader.search(COMMENTS_START_RE);
  const main = end === -1 ? afterHeader : afterHeader.slice(0, end);
  const commentsPart = end === -1 ? "" : afterHeader.slice(end);
  const lines = main.split("\n").map((l) => l.trim()).filter(Boolean);
  const linkUrl = lines[0] && URL_LINE_RE.test(lines[0]) ? lines[0] : null;
  const body = (linkUrl ? lines.slice(1) : lines).join(" ");
  const quote = /\n> ([^\n]+)/.exec(commentsPart);
  return {
    user: user!,
    subreddit: subreddit!,
    score: Number(score),
    comments: Number(comments),
    publishedAt: toIso(date!.trim()),
    linkUrl,
    body,
    topComment: quote?.[1]?.trim() ?? "",
  };
}

/** A Reddit search result as a story; null when the text is not in the expected shape. */
export function redditItemFromText(postUrl: string, title: string, text: string): RawItem | null {
  const post = parseRedditText(text);
  if (!post) return null;
  const linksOut = post.linkUrl !== null && !new URL(post.linkUrl).hostname.endsWith("reddit.com");
  const url = linksOut ? post.linkUrl! : postUrl;
  const video = videoFor(url);
  const description = post.body || (post.topComment ? `Top comment: ${post.topComment}` : "");
  return {
    platform: "reddit",
    title: title.replace(/\s+:\s+r\/\w+$/, ""),
    url,
    author: `r/${post.subreddit} · u/${post.user}`,
    description: clip(description),
    publishedAt: post.publishedAt,
    discussionUrl: postUrl,
    video,
    thumbnail: youtubeThumb(video) ?? (IMAGE_RE.test(url) ? url : null),
    metrics: { score: post.score, comments: post.comments },
  };
}
