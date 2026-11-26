import { byTime, timeOf } from "./feed.js";
import type { NewsItem, Platform, SearchPage } from "./types.js";

export type StreamKey = Platform | "pool";
/** Page n of one platform's results, newest first. */
export type StreamRead = (page: number) => Promise<NewsItem[]>;

const MIN_PAGE = 20; // read again within one request while fewer stories than this are ready
const ROUNDS = 3;
const MAX_ROUNDS = 8; // keep reading past ROUNDS only while nothing at all is ready (the site stops on an empty page)
const LOW_WAITING = 10; // a platform is read again once fewer of its stories are waiting
const UNDATED_PER_PAGE = 10;
const EMPTY_PAGES_TO_END = 2; // a filtered page can come back empty while later ones still have stories

interface Stream {
  read: StreamRead;
  page: number;
  done: boolean;
  empties: number; // pages in a row with nothing new
  failed: boolean;
  reading: boolean;
  oldest: number; // oldest story time read so far; Infinity until a dated story arrives
  waiting: NewsItem[]; // read but not shown yet
}

/**
 * Newest-first merge of every platform's results for one search, page after page. Each platform pages back in
 * time on its own; a story is shown only once every platform has been read back to its time, so a later page
 * never brings stories newer than an earlier one. Undated stories (Quora) close each page, a few at a time.
 */
export class LatestMerge {
  private readonly streams: Map<StreamKey, Stream>;
  private readonly pages: SearchPage[] = [];
  private readonly seen = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(reads: Partial<Record<StreamKey, StreamRead>>) {
    this.streams = new Map(
      Object.entries(reads).map(([key, read]) => [key as StreamKey, { read: read!, page: 0, done: false, empties: 0, failed: false, reading: false, oldest: Infinity, waiting: [] }]),
    );
  }

  /** Pages are built in order and kept, so asking again (or out of order) returns the same stories. */
  page(n: number): Promise<SearchPage> {
    const job = this.queue.then(async () => {
      while (this.pages.length <= n && this.hasMore()) this.pages.push(await this.next());
      return this.pages[n] ?? { items: [], hasMore: false, errors: [] };
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  /**
   * While a page is still loading: the newest stories read so far and the platforms still searching. Not yet in
   * order with those platforms, so the full page replaces it.
   */
  preview(): SearchPage {
    const waiting = [...this.streams.values()].flatMap((s) => s.waiting);
    return {
      items: [...waiting.filter((i) => timeOf(i) > 0).sort(byTime).slice(0, MIN_PAGE), ...waiting.filter((i) => timeOf(i) === 0).slice(0, UNDATED_PER_PAGE)],
      hasMore: true,
      errors: [],
      partial: true,
      pending: [...this.streams].flatMap(([key, s]) => (s.reading && key !== "pool" ? [key] : [])),
    };
  }

  private hasMore(): boolean {
    return [...this.streams.values()].some((s) => !s.done || s.waiting.length > 0);
  }

  /** Stories at or after this time can be shown: every platform still running has been read back that far. */
  private watermark(): number {
    const limits = [...this.streams.values()].filter((s) => !s.done && !s.failed && Number.isFinite(s.oldest)).map((s) => s.oldest);
    return limits.length > 0 ? Math.max(...limits) : -Infinity;
  }

  private ready(): NewsItem[] {
    const mark = this.watermark();
    return [...this.streams.values()].flatMap((s) => s.waiting.filter((i) => timeOf(i) > 0 && timeOf(i) >= mark));
  }

  private async readRound(errors: Map<Platform, string>): Promise<boolean> {
    const due = [...this.streams.entries()].filter(([, s]) => !s.done && s.waiting.length < LOW_WAITING);
    await Promise.all(
      due.map(async ([key, s]) => {
        s.reading = true;
        try {
          const items = await s.read(s.page);
          // check and record in one step, so a repeat inside the same page is dropped too
          const fresh = items.filter((i) => !this.seen.has(i.id) && Boolean(this.seen.add(i.id)));
          const times = fresh.map(timeOf).filter((t) => t > 0);
          s.page += 1;
          s.failed = false;
          s.empties = fresh.length === 0 ? s.empties + 1 : 0;
          s.done = s.empties >= EMPTY_PAGES_TO_END; // nothing new twice: the platform has run out (or repeats itself)
          if (times.length > 0) s.oldest = Math.min(s.oldest, ...times);
          s.waiting.push(...fresh);
        } catch (err) {
          s.failed = true; // not waited for this page; retried on the next
          if (key !== "pool") errors.set(key, err instanceof Error ? err.message : String(err));
        } finally {
          s.reading = false;
        }
      }),
    );
    return due.length > 0;
  }

  private async next(): Promise<SearchPage> {
    const errors = new Map<Platform, string>();
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const enough = this.ready().length >= (round < ROUNDS ? MIN_PAGE : 1);
      if ((round > 0 && enough) || !(await this.readRound(errors))) break;
    }
    const allDone = [...this.streams.values()].every((s) => s.done);
    let dated = this.ready().sort(byTime);
    // still nothing after MAX_ROUNDS: show the newest waiting stories rather than an empty page
    if (dated.length === 0 && !allDone) dated = [...this.streams.values()].flatMap((s) => s.waiting.filter((i) => timeOf(i) > 0)).sort(byTime).slice(0, MIN_PAGE);
    const undatedWaiting = [...this.streams.values()].flatMap((s) => s.waiting.filter((i) => timeOf(i) === 0));
    const undated = allDone ? undatedWaiting : undatedWaiting.slice(0, UNDATED_PER_PAGE);
    const shown = new Set([...dated, ...undated].map((i) => i.id));
    for (const s of this.streams.values()) s.waiting = s.waiting.filter((i) => !shown.has(i.id));
    return {
      items: [...dated, ...undated],
      hasMore: this.hasMore(),
      errors: [...errors].map(([platform, error]) => ({ platform, error })),
    };
  }
}
