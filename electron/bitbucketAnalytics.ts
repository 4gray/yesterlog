import { setTimeout as delay } from "node:timers/promises";
import type {
  PrAnalyticsProgress,
  PrAnalyticsPullRequest,
  PrAnalyticsRepository,
  PrAnalyticsRequest,
  PrAnalyticsUser
} from "../shared/prAnalytics";
import { analyticsRepositories, analyticsUserKey, sameAnalyticsUser } from "../shared/prAnalytics";
import { withBitbucketSlot } from "./bitbucketTransport";

const BASE = "https://api.bitbucket.org/2.0";
const REQUEST_BUDGET = 450;
const HISTORY_PAGE_SIZE = 50;
interface User {
  account_id?: string;
  uuid?: string;
  display_name?: string;
}
interface PullRequest {
  id: number;
  title?: string;
  state?: string;
  draft?: boolean;
  author?: User;
  created_on?: string;
  updated_on?: string;
}
interface Comment {
  id?: number;
  created_on?: string;
  user?: User;
  deleted?: boolean;
  pending?: boolean;
}
interface Activity {
  update?: { date?: string; state?: string };
  approval?: { date?: string; user?: User };
  changes_requested?: { date?: string; user?: User };
}
interface Page<T> {
  values: T[];
  next?: string;
}
const user = (u?: User): PrAnalyticsUser => ({
  accountId: u?.account_id,
  uuid: u?.uuid,
  displayName: u?.display_name
});
const date = (s?: string) => (s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : undefined);
const message = (e: unknown) => (e instanceof Error ? e.message : "Unable to read Bitbucket history.");
const oversizedHistoryCursor = (cursor: string | null) => {
  if (!cursor) return false;
  try {
    return Number(new URL(cursor).searchParams.get("pagelen")) > HISTORY_PAGE_SIZE;
  } catch {
    return false; // The request validator will reject malformed/unsafe URLs.
  }
};

/** Persists only metadata; never fetches diff or commit content. */
export async function syncPrAnalytics(
  request: PrAnalyticsRequest,
  signal: AbortSignal = new AbortController().signal,
  progress: (value: PrAnalyticsProgress) => void = () => undefined
): Promise<PrAnalyticsRepository> {
  const { settings, repository, rangeStart, rangeEnd, requestId } = request;
  const workspace = settings.bitbucketWorkspace.trim();
  if (!workspace || !settings.bitbucketEmail.trim() || !settings.bitbucketApiToken.trim())
    throw new Error("Connect Bitbucket in Settings first.");
  if (!analyticsRepositories(settings.bitbucketRepositories).includes(repository))
    throw new Error("Choose a configured Bitbucket repository.");
  const start = Date.parse(rangeStart),
    end = Date.parse(rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 370 * 86400000)
    throw new Error("Choose a valid range of at most one year.");
  const prefix = `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/pullrequests`;
  const warnings = new Set<string>();
  let requests = 0,
    enriched = 0,
    stopped = false;
  const prs = new Map<number, PrAnalyticsPullRequest>();
  const notify = () => progress({ requestId, repository, scanned: prs.size, enriched, requests });
  async function read<T>(path: string): Promise<T> {
    const url = new URL(path.startsWith("/") ? `${BASE}${path}` : path);
    if (
      url.origin !== "https://api.bitbucket.org" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/2.0/")
    )
      throw new Error("Rejected an unsafe Bitbucket pagination link.");
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      if (requests >= REQUEST_BUDGET)
        throw new Error("Request budget reached. Refresh again to continue incomplete history.");
      requests += 1;
      notify();
      const response = await withBitbucketSlot(
        () =>
          fetch(url.href, {
            headers: {
              Accept: "application/json",
              Authorization: `Basic ${Buffer.from(`${settings.bitbucketEmail.trim()}:${settings.bitbucketApiToken.trim()}`).toString("base64")}`
            },
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
          }),
        signal
      );
      if (response.ok) return (await response.json()) as T;
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        throw new Error(
          `Bitbucket access denied (${response.status}). Check your token and read permissions.`
        );
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retry = response.headers.get("Retry-After");
        const retryMs =
          retry == null
            ? 1000 * 2 ** attempt
            : Number.isFinite(Number(retry))
              ? Number(retry) * 1000
              : Date.parse(retry) - Date.now();
        if (retryMs > 30000) {
          stopped = true;
          throw new Error("Bitbucket rate limit reached. Try refreshing later.");
        }
        await delay(Math.max(0, Number.isFinite(retryMs) ? retryMs : 1000), undefined, { signal });
        continue;
      }
      if (response.status === 429 || response.status >= 500) stopped = true;
      const resource = url.pathname.endsWith("/activity")
        ? "PR activity"
        : url.pathname.endsWith("/comments")
          ? "PR comments"
          : url.pathname.endsWith("/pullrequests")
            ? "the PR list"
            : "the current user";
      // Do not persist response bodies or URLs: they can contain private repository data.
      throw new Error(`Bitbucket request failed (${response.status}) while loading ${resource}. Refresh to retry incomplete history.`);
    }
  }
  const currentUser = user(await read<User>("/user"));
  if (!analyticsUserKey(currentUser)) throw new Error("Bitbucket did not return a stable user identity.");
  const now = new Date().toISOString();
  const previous = request.previous;
  const reusable =
    previous &&
    previous.workspace === workspace &&
    previous.repository === repository &&
    sameAnalyticsUser(previous.user, currentUser);
  const old = new Map(reusable ? previous.pullRequests.map((p) => [p.id, p]) : []);
  const resume =
    reusable &&
    !previous.listComplete &&
    previous.scanCursors &&
    Object.values(previous.scanCursors).some((cursor) => cursor !== null) &&
    previous.rangeStart === rangeStart &&
    previous.rangeEnd === rangeEnd &&
    Date.now() - Date.parse(previous.syncedAt) < 86400000;
  const scanCursors: Record<string, string | null> = resume ? { ...previous.scanCursors } : {};
  if (resume) for (const prior of old.values()) prs.set(prior.id, { ...prior });
  let listComplete = true;
  // Separate state scans work with the documented Cloud states and preserve coverage per failure.
  for (const state of ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]) {
    if (scanCursors[state] === null) continue;
    let next: string | undefined =
      scanCursors[state] ??
      `${BASE}${prefix}?${new URLSearchParams({ state, sort: "-updated_on", pagelen: "50" })}`;
    const seen = new Set<string>();
    try {
      while (next) {
        scanCursors[state] = next;
        if (seen.has(next)) throw new Error("Bitbucket repeated a pagination link; history is incomplete.");
        seen.add(next);
        const page: Page<PullRequest> = await read(next);
        if (!Array.isArray(page.values)) throw new Error("Bitbucket returned an invalid PR page.");
        let reachedStart = false;
        for (const raw of page.values) {
          if (!Number.isInteger(raw.id) || raw.id <= 0) {
            warnings.add("Some PRs have invalid identifiers.");
            listComplete = false;
            continue;
          }
          const updatedAt = date(raw.updated_on);
          if (updatedAt && Date.parse(updatedAt) < start) {
            reachedStart = true;
            continue;
          }
          const prior = old.get(raw.id);
          const pr: PrAnalyticsPullRequest = {
            key: JSON.stringify([workspace, repository, raw.id]),
            id: raw.id,
            repository,
            title: raw.title || `Pull request #${raw.id}`,
            url: `https://bitbucket.org/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/pull-requests/${raw.id}`,
            state: raw.state || state,
            draft: raw.draft === true,
            author: user(raw.author),
            createdAt: date(raw.created_on),
            updatedAt,
            comments: [],
            activityComplete: false,
            commentsComplete: false,
            mergeTimeMissing: (raw.state || state) === "MERGED"
          };
          // Reconcile at least daily, even if a deletion did not change updated_on.
          if (
            prior?.activityComplete &&
            prior.commentsComplete &&
            prior.updatedAt &&
            prior.updatedAt === updatedAt &&
            prior.state === pr.state &&
            prior.fetchedAt &&
            Date.now() - Date.parse(prior.fetchedAt) < 86400000
          ) {
            prs.set(pr.id, {
              ...prior,
              ...pr,
              comments: prior.comments,
              mergedAt: prior.mergedAt,
              firstResponseAt: prior.firstResponseAt,
              activityComplete: true,
              commentsComplete: true,
              mergeTimeMissing: prior.mergeTimeMissing,
              fetchedAt: prior.fetchedAt
            });
          } else {
            if (
              prior?.updatedAt === updatedAt &&
              prior?.state === pr.state &&
              prior?.history &&
              Date.now() - Date.parse(prior.history.startedAt) < 86400000
            )
              pr.history = prior.history;
            prs.set(pr.id, pr);
          }
        }
        notify();
        next = reachedStart ? undefined : page.next;
        scanCursors[state] = next ?? null;
      }
    } catch (e) {
      listComplete = false;
      warnings.add(`${state}: ${signal.aborted ? "Sync cancelled." : message(e)}`);
      if (signal.aborted || stopped || requests >= REQUEST_BUDGET) break;
    }
  }
  // Retain older evidence on a failed list scan, but explicitly mark it stale/incomplete.
  if (!listComplete && !resume)
    for (const prior of old.values())
      if (!prs.has(prior.id))
        prs.set(prior.id, {
          ...prior,
          activityComplete: false,
          commentsComplete: false
        });
  for (const pr of prs.values()) {
    if (signal.aborted || stopped || requests >= REQUEST_BUDGET) break;
    if (pr.activityComplete && pr.commentsComplete) {
      enriched += 1;
      continue;
    }
    try {
      // v3.3.2 cached rejected pagelen=100 URLs. Restart those feeds instead of
      // replaying the same invalid request or changing page offsets mid-history.
      if (pr.history && [pr.history.activityNext, pr.history.commentsNext].some(oversizedHistoryCursor)) {
        delete pr.history;
        pr.activityComplete = false;
        pr.commentsComplete = false;
        pr.mergedAt = undefined;
        pr.firstResponseAt = undefined;
        pr.comments = [];
        pr.mergeTimeMissing = pr.state === "MERGED";
      }
      const history = (pr.history ??= {
        startedAt: now,
        activityNext: `${BASE}${prefix}/${pr.id}/activity?pagelen=${HISTORY_PAGE_SIZE}`,
        commentsNext: `${BASE}${prefix}/${pr.id}/comments?pagelen=${HISTORY_PAGE_SIZE}`,
        comments: []
      });
      const observeResponse = (at: string | undefined, author: PrAnalyticsUser) => {
        if (
          at &&
          pr.createdAt &&
          at >= pr.createdAt &&
          ((author.accountId && pr.author.accountId) || (author.uuid && pr.author.uuid)) &&
          !sameAnalyticsUser(author, pr.author)
        ) {
          if (!history.firstResponseAt || at < history.firstResponseAt) history.firstResponseAt = at;
        }
      };
      const seen = new Set<string>();
      while (history.activityNext) {
        if (seen.has(history.activityNext))
          throw new Error("Bitbucket repeated a pagination link; history is incomplete.");
        seen.add(history.activityNext);
        const page = await read<Page<Activity>>(history.activityNext);
        if (!Array.isArray(page.values)) throw new Error("Bitbucket returned an invalid activity page.");
        for (const event of page.values) {
          const at = date(event.update?.date);
          if (
            event.update?.state === "MERGED" &&
            at &&
            (!pr.createdAt || at >= pr.createdAt) &&
            (!history.mergedAt || at < history.mergedAt)
          )
            history.mergedAt = at;
          const response = event.approval ?? event.changes_requested;
          observeResponse(date(response?.date), user(response?.user));
        }
        history.activityNext = page.next ?? null;
      }
      // Only a complete feed establishes the earliest merge; later MERGED snapshots do not move it.
      pr.mergedAt = history.mergedAt;
      pr.mergeTimeMissing = pr.state === "MERGED" && !pr.mergedAt;
      pr.activityComplete = true;
      const comments = new Map(history.comments.map((c) => [c.id, c]));
      while (history.commentsNext) {
        if (seen.has(history.commentsNext))
          throw new Error("Bitbucket repeated a pagination link; history is incomplete.");
        seen.add(history.commentsNext);
        const page = await read<Page<Comment>>(history.commentsNext);
        if (!Array.isArray(page.values)) throw new Error("Bitbucket returned an invalid comment page.");
        for (const comment of page.values) {
          if (comment.deleted || comment.pending) continue;
          const createdAt = date(comment.created_on);
          if (!Number.isInteger(comment.id) || !createdAt)
            throw new Error("Some comments lack IDs or timestamps.");
          comments.set(comment.id!, { id: comment.id!, createdAt, author: user(comment.user) });
        }
        history.comments = [...comments.values()];
        history.commentsNext = page.next ?? null;
      }
      pr.comments = history.comments;
      pr.commentsComplete = true;
      for (const comment of pr.comments) observeResponse(comment.createdAt, comment.author);
      pr.firstResponseAt = history.firstResponseAt;
      delete pr.history;
      pr.fetchedAt = now;
    } catch (e) {
      warnings.add(signal.aborted ? "Sync cancelled. Refresh to continue." : message(e));
    }
    enriched += 1;
    notify();
  }
  if (signal.aborted) warnings.add("Sync cancelled. Refresh to continue.");
  if (requests >= REQUEST_BUDGET)
    warnings.add("Request budget reached. Refresh again to continue incomplete history.");
  const pullRequests = [...prs.values()];
  if (Object.values(scanCursors).filter((v) => v === null).length !== 4) listComplete = false;
  const missingDates = pullRequests.some((p) => !p.createdAt || !p.updatedAt);
  if (missingDates) warnings.add("Some PRs lack creation or update timestamps.");
  const complete =
    listComplete &&
    !missingDates &&
    pullRequests.every((p) => p.activityComplete && p.commentsComplete && !p.mergeTimeMissing);
  if (pullRequests.some((p) => p.activityComplete && p.mergeTimeMissing))
    warnings.add("Some merged PRs have no dated merge event; they are excluded from merge totals.");
  return {
    workspace,
    repository,
    user: currentUser,
    rangeStart,
    rangeEnd,
    syncedAt: now,
    listComplete,
    complete,
    pullRequests,
    warnings: [...warnings],
    scanCursors
  };
}
