import type {
  AppSettings,
  BitbucketCommitGroup,
  BitbucketConnectionResult,
  BitbucketReviewEvent,
  BitbucketReviewSession,
  BitbucketReviewSyncRequest,
  BitbucketReviewSyncResult
} from "../shared/types";

interface BitbucketUser {
  uuid?: string;
  account_id?: string;
  display_name?: string;
  nickname?: string;
}

interface BitbucketRepository {
  name?: string;
  slug?: string;
}

interface BitbucketPullRequest {
  id: number;
  title?: string;
  description?: string;
  state?: string;
  created_on?: string;
  updated_on?: string;
  author?: BitbucketUser;
  source?: {
    branch?: {
      name?: string;
    };
  };
  destination?: {
    branch?: {
      name?: string;
    };
  };
  links?: {
    html?: {
      href?: string;
    };
  };
}

interface BitbucketActivityItem {
  comment?: {
    id?: number | string;
    created_on?: string;
    updated_on?: string;
    user?: BitbucketUser;
    content?: {
      raw?: string;
      markup?: string;
      html?: string;
    };
  };
  approval?: {
    date?: string;
    user?: BitbucketUser;
  };
  changes_requested?: {
    date?: string;
    user?: BitbucketUser;
  };
  update?: {
    date?: string;
    author?: BitbucketUser;
  };
}

interface BitbucketCommit {
  hash?: string;
  date?: string;
  message?: string;
  author?: {
    user?: BitbucketUser;
    raw?: string;
  };
}

interface BitbucketPage<T> {
  values?: T[];
  next?: string;
}

class BitbucketApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "BitbucketApiError";
  }
}

const API_BASE_URL = "https://api.bitbucket.org/2.0";
const PULL_REQUEST_STATES = ["OPEN", "MERGED", "DECLINED"] as const;
const MAX_PAGES_PER_REPOSITORY_STATE = 8;
const MAX_ACTIVITY_PAGES_PER_PULL_REQUEST = 8;
const MAX_COMMIT_PAGES_PER_PULL_REQUEST = 6;
const JIRA_ISSUE_KEY_RE = /\b([a-z][a-z0-9]+-\d+)\b/i;

const ensureBitbucketSettings = (settings: AppSettings) => {
  if (!settings.bitbucketEmail.trim() || !settings.bitbucketApiToken.trim()) {
    throw new BitbucketApiError("Add your Bitbucket email and API token first.");
  }

  if (!settings.bitbucketWorkspace.trim()) {
    throw new BitbucketApiError("Add your Bitbucket workspace first.");
  }

  if (parseRepositorySlugs(settings.bitbucketRepositories).length === 0) {
    throw new BitbucketApiError("Add at least one Bitbucket repository slug first.");
  }
};

const parseRepositorySlugs = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((candidate) => candidate.trim())
        .filter(Boolean)
    )
  );

const authHeader = (settings: AppSettings) => {
  return `Basic ${Buffer.from(`${settings.bitbucketEmail}:${settings.bitbucketApiToken}`).toString("base64")}`;
};

const parseBitbucketError = async (response: Response) => {
  const fallback = `${response.status} ${response.statusText}`;

  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        detail?: string;
      };
      message?: string;
    };
    return body.error?.detail ?? body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
};

const bitbucketRequest = async <T>(settings: AppSettings, pathOrUrl: string, init: RequestInit = {}) => {
  ensureBitbucketSettings(settings);
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(settings),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await parseBitbucketError(response);

    if (response.status === 401 || response.status === 403) {
      throw new BitbucketApiError(`Bitbucket rejected the credentials or scopes: ${message}`, response.status);
    }

    throw new BitbucketApiError(`Bitbucket request failed: ${message}`, response.status);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

const fetchCurrentUser = (settings: AppSettings) => {
  return bitbucketRequest<BitbucketUser>(settings, "/user");
};

const normalizeWorkspace = (settings: AppSettings) => settings.bitbucketWorkspace.trim();

const repositoryPath = (workspace: string, repositorySlug: string) =>
  `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repositorySlug)}`;

const fetchRepository = (settings: AppSettings, workspace: string, repositorySlug: string) => {
  return bitbucketRequest<BitbucketRepository>(settings, repositoryPath(workspace, repositorySlug));
};

export const testBitbucketConnection = async (settings: AppSettings): Promise<BitbucketConnectionResult> => {
  try {
    const workspace = normalizeWorkspace(settings);
    const repositories = parseRepositorySlugs(settings.bitbucketRepositories);
    const [user, repository] = await Promise.all([
      fetchCurrentUser(settings),
      fetchRepository(settings, workspace, repositories[0])
    ]);

    return {
      ok: true,
      message: `Connected to Bitbucket as ${user.display_name ?? settings.bitbucketEmail}; found ${repository.name ?? repositories[0]}.`,
      accountId: user.account_id ?? user.uuid,
      displayName: user.display_name,
      workspace
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to connect to Bitbucket."
    };
  }
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const sameUser = (left?: BitbucketUser, right?: BitbucketUser) => {
  if (!left || !right) {
    return false;
  }

  if (left.uuid && right.uuid && left.uuid === right.uuid) {
    return true;
  }

  if (left.account_id && right.account_id && left.account_id === right.account_id) {
    return true;
  }

  return Boolean(left.display_name && right.display_name && left.display_name === right.display_name);
};

const extractJiraIssueKey = (...values: Array<string | undefined>) => {
  for (const value of values) {
    const match = value?.match(JIRA_ISSUE_KEY_RE)?.[1];
    if (match) {
      return match.toUpperCase();
    }
  }

  return undefined;
};

const getActivityUser = (item: BitbucketActivityItem) =>
  item.comment?.user ?? item.approval?.user ?? item.changes_requested?.user ?? item.update?.author;

const getActivityDate = (item: BitbucketActivityItem) =>
  item.comment?.created_on ?? item.comment?.updated_on ?? item.approval?.date ?? item.changes_requested?.date ?? item.update?.date;

const getActivityType = (item: BitbucketActivityItem): BitbucketReviewEvent["type"] | undefined => {
  if (item.comment) {
    return "comment";
  }

  if (item.approval) {
    return "approved";
  }

  if (item.changes_requested) {
    return "changes_requested";
  }

  if (item.update) {
    return "updated";
  }

  return undefined;
};

const toReviewEvent = (item: BitbucketActivityItem, index: number): BitbucketReviewEvent | undefined => {
  const type = getActivityType(item);
  const occurredAt = getActivityDate(item);

  if (!type || !occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
    return undefined;
  }

  const commentId = item.comment?.id == null ? "" : String(item.comment.id);
  return {
    id: `${type}:${commentId}:${occurredAt}:${index}`,
    type,
    occurredAt
  };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const estimateReviewSeconds = (events: BitbucketReviewEvent[]) => {
  const timestamps = events.map((event) => new Date(event.occurredAt).getTime()).sort((a, b) => a - b);
  const commentCount = events.filter((event) => event.type === "comment").length;
  const minimum = commentCount >= 6 ? 40 * 60 : commentCount > 0 ? 25 * 60 : 20 * 60;

  if (timestamps.length <= 1) {
    return minimum;
  }

  const spanSeconds = Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000);
  return clamp(spanSeconds + 10 * 60, minimum, 2 * 60 * 60);
};

const reviewStateLabel = (events: BitbucketReviewEvent[]): BitbucketReviewSession["reviewStateLabel"] => {
  if (events.some((event) => event.type === "changes_requested")) {
    return "CHANGES";
  }

  if (events.some((event) => event.type === "approved")) {
    return "APPROVED";
  }

  if (events.some((event) => event.type === "comment")) {
    return "COMMENTED";
  }

  return "UPDATED";
};

const reviewConfidence = (events: BitbucketReviewEvent[]): BitbucketReviewSession["confidence"] => {
  const commentCount = events.filter((event) => event.type === "comment").length;
  const hasDecision = events.some((event) => event.type === "approved" || event.type === "changes_requested");

  if ((hasDecision && commentCount > 0) || events.length >= 3) {
    return "high";
  }

  if (commentCount > 1 || hasDecision) {
    return "medium";
  }

  return "low";
};

const fetchPullRequestsForRepository = async (
  settings: AppSettings,
  workspace: string,
  repositorySlug: string,
  weekStart: Date
) => {
  const pullRequests = new Map<number, BitbucketPullRequest>();

  for (const state of PULL_REQUEST_STATES) {
    let next: string | undefined =
      `${API_BASE_URL}${repositoryPath(workspace, repositorySlug)}/pullrequests?${new URLSearchParams({
        state,
        sort: "-updated_on",
        pagelen: "50"
      }).toString()}`;
    let guard = 0;

    while (next && guard < MAX_PAGES_PER_REPOSITORY_STATE) {
      const page: BitbucketPage<BitbucketPullRequest> = await bitbucketRequest(settings, next);
      const values = page.values ?? [];

      for (const pullRequest of values) {
        const updatedAt = pullRequest.updated_on ? new Date(pullRequest.updated_on) : undefined;

        if (updatedAt && updatedAt < weekStart) {
          next = undefined;
          break;
        }

        pullRequests.set(pullRequest.id, pullRequest);
      }

      guard += 1;
      next = next ? page.next : undefined;
    }
  }

  return [...pullRequests.values()];
};

const fetchPullRequestActivity = async (
  settings: AppSettings,
  workspace: string,
  repositorySlug: string,
  pullRequestId: number
) => {
  const activity: BitbucketActivityItem[] = [];
  let next: string | undefined = `${API_BASE_URL}${repositoryPath(
    workspace,
    repositorySlug
  )}/pullrequests/${pullRequestId}/activity?pagelen=50`;
  let guard = 0;

  while (next && guard < MAX_ACTIVITY_PAGES_PER_PULL_REQUEST) {
    const page: BitbucketPage<BitbucketActivityItem> = await bitbucketRequest(settings, next);
    activity.push(...(page.values ?? []));
    guard += 1;
    next = page.next;
  }

  return activity;
};

const buildSessionsForPullRequest = ({
  workspace,
  repository,
  pullRequest,
  events,
  currentUser,
  weekStart,
  weekEndExclusive
}: {
  workspace: string;
  repository: BitbucketRepository;
  pullRequest: BitbucketPullRequest;
  events: BitbucketReviewEvent[];
  currentUser: BitbucketUser;
  weekStart: Date;
  weekEndExclusive: Date;
}) => {
  const eventsByDate = new Map<string, BitbucketReviewEvent[]>();

  for (const event of events) {
    const occurredAt = new Date(event.occurredAt);

    if (occurredAt < weekStart || occurredAt >= weekEndExclusive) {
      continue;
    }

    const dateKey = toDateKey(occurredAt);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    dayEvents.push(event);
    eventsByDate.set(dateKey, dayEvents);
  }

  const sessions: BitbucketReviewSession[] = [];
  const repositorySlug = repository.slug ?? "repository";
  const repositoryName = repository.name ?? repositorySlug;
  const pullRequestAuthorAccountId = pullRequest.author?.account_id ?? pullRequest.author?.uuid;
  const pullRequestAuthorDisplayName = pullRequest.author?.display_name ?? pullRequest.author?.nickname;
  const isPullRequestAuthor = sameUser(pullRequest.author, currentUser);
  const jiraIssueKey = extractJiraIssueKey(
    pullRequest.title,
    pullRequest.description,
    pullRequest.source?.branch?.name,
    pullRequest.destination?.branch?.name
  );

  for (const [dateKey, dayEvents] of eventsByDate) {
    const sortedEvents = [...dayEvents].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    const firstAt = new Date(sortedEvents[0].occurredAt);
    const started = new Date(firstAt.getTime() - 5 * 60 * 1000);
    const estimatedSeconds = estimateReviewSeconds(sortedEvents);
    const ended = new Date(started.getTime() + estimatedSeconds * 1000);
    const commentCount = sortedEvents.filter((event) => event.type === "comment").length;

    sessions.push({
      id: `${workspace}/${repositorySlug}#${pullRequest.id}:${dateKey}`,
      workspace,
      repositorySlug,
      repositoryName,
      pullRequestId: pullRequest.id,
      pullRequestTitle: pullRequest.title ?? `Pull request #${pullRequest.id}`,
      pullRequestUrl: pullRequest.links?.html?.href ?? `https://bitbucket.org/${workspace}/${repositorySlug}/pull-requests/${pullRequest.id}`,
      pullRequestState: pullRequest.state ?? "UNKNOWN",
      pullRequestAuthorAccountId,
      pullRequestAuthorDisplayName,
      isPullRequestAuthor,
      sourceBranch: pullRequest.source?.branch?.name,
      destinationBranch: pullRequest.destination?.branch?.name,
      jiraIssueKey,
      dateKey,
      startedISO: started.toISOString(),
      endedISO: ended.toISOString(),
      estimatedSeconds,
      reviewStateLabel: reviewStateLabel(sortedEvents),
      commentCount,
      activityCount: sortedEvents.length,
      confidence: reviewConfidence(sortedEvents),
      events: sortedEvents,
      status: "unlogged"
    });
  }

  return sessions;
};

const estimateCommitSeconds = (commits: BitbucketCommit[]) => {
  const timestamps = commits
    .map((commit) => (commit.date ? new Date(commit.date).getTime() : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const minimum = commits.length >= 4 ? 90 * 60 : commits.length >= 2 ? 50 * 60 : 30 * 60;

  if (timestamps.length <= 1) {
    return minimum;
  }

  const spanSeconds = Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000);
  // Add lead time for coding before the first commit of the run.
  return clamp(spanSeconds + 25 * 60, minimum, 4 * 60 * 60);
};

const commitGroupConfidence = (
  commits: BitbucketCommit[],
  jiraIssueKey?: string
): BitbucketReviewSession["confidence"] => {
  if (jiraIssueKey && commits.length >= 2) {
    return "high";
  }

  if (jiraIssueKey || commits.length >= 2) {
    return "medium";
  }

  return "low";
};

const cleanCommitSubject = (message?: string) => {
  const first = (message ?? "").split("\n")[0].trim();
  const withoutTicket = first.replace(/^[a-z][a-z0-9]+-\d+[:\s-]+/i, "").trim();
  const withoutType = withoutTicket
    .replace(/^(feat|fix|chore|refactor|docs|test|style|perf|build|ci)(\([^)]*\))?!?:\s*/i, "")
    .trim();
  return withoutType || first || "Code changes";
};

const fetchPullRequestCommits = async (
  settings: AppSettings,
  workspace: string,
  repositorySlug: string,
  pullRequestId: number
) => {
  const commits: BitbucketCommit[] = [];
  let next: string | undefined = `${API_BASE_URL}${repositoryPath(
    workspace,
    repositorySlug
  )}/pullrequests/${pullRequestId}/commits?pagelen=50`;
  let guard = 0;

  while (next && guard < MAX_COMMIT_PAGES_PER_PULL_REQUEST) {
    const page: BitbucketPage<BitbucketCommit> = await bitbucketRequest(settings, next);
    commits.push(...(page.values ?? []));
    guard += 1;
    next = page.next;
  }

  return commits;
};

export const buildCommitGroupsForPullRequest = ({
  workspace,
  repository,
  pullRequest,
  commits,
  currentUser,
  weekStart,
  weekEndExclusive
}: {
  workspace: string;
  repository: BitbucketRepository;
  pullRequest: BitbucketPullRequest;
  commits: BitbucketCommit[];
  currentUser: BitbucketUser;
  weekStart: Date;
  weekEndExclusive: Date;
}): BitbucketCommitGroup[] => {
  const repositorySlug = repository.slug ?? "repository";
  const repositoryName = repository.name ?? repositorySlug;
  const branch = pullRequest.source?.branch?.name;
  const jiraIssueKey = extractJiraIssueKey(
    pullRequest.title,
    pullRequest.description,
    branch,
    pullRequest.destination?.branch?.name
  );

  const commitsByDate = new Map<string, BitbucketCommit[]>();
  for (const commit of commits) {
    if (!sameUser(commit.author?.user, currentUser) || !commit.date) {
      continue;
    }
    const date = new Date(commit.date);
    if (Number.isNaN(date.getTime()) || date < weekStart || date >= weekEndExclusive) {
      continue;
    }
    const dateKey = toDateKey(date);
    const dayCommits = commitsByDate.get(dateKey) ?? [];
    dayCommits.push(commit);
    commitsByDate.set(dateKey, dayCommits);
  }

  const groups: BitbucketCommitGroup[] = [];
  for (const [dateKey, dayCommits] of commitsByDate) {
    const sorted = [...dayCommits].sort(
      (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
    );
    groups.push({
      id: `${workspace}/${repositorySlug}#${pullRequest.id}:commits:${dateKey}`,
      workspace,
      repositorySlug,
      repositoryName,
      branch,
      jiraIssueKey,
      pullRequestId: pullRequest.id,
      dateKey,
      commitCount: sorted.length,
      firstCommitISO: new Date(sorted[0].date ?? "").toISOString(),
      lastCommitISO: new Date(sorted[sorted.length - 1].date ?? "").toISOString(),
      estimatedSeconds: estimateCommitSeconds(sorted),
      primaryMessage: cleanCommitSubject(sorted[0].message),
      confidence: commitGroupConfidence(sorted, jiraIssueKey)
    });
  }

  return groups;
};

export const syncBitbucketReviewSessions = async (
  request: BitbucketReviewSyncRequest
): Promise<BitbucketReviewSyncResult> => {
  const { settings, weekKey, weekStartISO, weekEndExclusiveISO } = request;
  const workspace = normalizeWorkspace(settings);
  const weekStart = new Date(weekStartISO);
  const weekEndExclusive = new Date(weekEndExclusiveISO);
  const repositorySlugs = parseRepositorySlugs(settings.bitbucketRepositories);
  const user = await fetchCurrentUser(settings);

  const sessions: BitbucketReviewSession[] = [];
  const commitGroups: BitbucketCommitGroup[] = [];
  let pullRequestCount = 0;
  let repositoryCount = 0;

  for (const repositorySlug of repositorySlugs) {
    const repository = await fetchRepository(settings, workspace, repositorySlug);
    const pullRequests = await fetchPullRequestsForRepository(settings, workspace, repositorySlug, weekStart);
    repositoryCount += 1;
    pullRequestCount += pullRequests.length;

    for (const pullRequest of pullRequests) {
      const activity = await fetchPullRequestActivity(settings, workspace, repositorySlug, pullRequest.id);
      const events = activity
        .filter((item) => sameUser(getActivityUser(item), user))
        .map(toReviewEvent)
        .filter((event): event is BitbucketReviewEvent => Boolean(event));

      sessions.push(
        ...buildSessionsForPullRequest({
          workspace,
          repository,
          pullRequest,
          events,
          currentUser: user,
          weekStart,
          weekEndExclusive
        })
      );

      // Your own coding work: collect commits from PRs you authored.
      if (sameUser(pullRequest.author, user)) {
        const commits = await fetchPullRequestCommits(settings, workspace, repositorySlug, pullRequest.id);
        commitGroups.push(
          ...buildCommitGroupsForPullRequest({
            workspace,
            repository,
            pullRequest,
            commits,
            currentUser: user,
            weekStart,
            weekEndExclusive
          })
        );
      }
    }
  }

  sessions.sort((a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime());
  commitGroups.sort((a, b) => new Date(a.firstCommitISO).getTime() - new Date(b.firstCommitISO).getTime());

  return {
    weekKey,
    weekStartISO,
    weekEndExclusiveISO,
    syncedAt: new Date().toISOString(),
    accountId: user.account_id ?? user.uuid,
    displayName: user.display_name ?? user.nickname,
    workspace,
    repositoryCount,
    pullRequestCount,
    sessionCount: sessions.length,
    sessions,
    commitGroups
  };
};
