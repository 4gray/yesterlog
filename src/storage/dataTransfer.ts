// Transfers drain existing work before freezing writes until the snapshot/restore finishes.
const pending = new Set<Promise<unknown>>();
const flushers = new Set<() => Promise<unknown>>();
let frozen = false;
let transferring = false;

export const assertDataWritable = () => {
  if (frozen) throw new Error("Data transfer is in progress. Please wait.");
};

export const trackDataOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    assertDataWritable();
    const task = operation();
    pending.add(task);
    void task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  } catch (error) {
    return Promise.reject(error);
  }
};

export const registerDataFlusher = (flush: () => Promise<unknown>) => {
  flushers.add(flush);
  return () => { flushers.delete(flush); };
};

export const beginDataTransfer = async () => {
  if (transferring) throw new Error("Another data transfer is already running.");
  transferring = true;
  try {
    await Promise.all([...flushers].map((flush) => flush()));
    // A completed network request can enqueue a storage write in its caller.
    do {
      await Promise.all([...pending]);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } while (pending.size);
    frozen = true;
  } catch (error) {
    transferring = false;
    throw error;
  }
};

export const endDataTransfer = () => {
  frozen = false;
  transferring = false;
};
