/** Shared in-process concurrency bound for personal review and analytics requests. */
let active = 0;
const waiting: Array<() => void> = [];
export async function withBitbucketSlot<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    signal?.throwIfAborted();
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}
