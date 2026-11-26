/** A one-at-a-time queue: each task starts at least `gapMs` after the previous one finished (for sites with request limits). */
export function spaced(gapMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const job = queue.then(task);
    queue = job.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, gapMs)));
    return job;
  };
}
