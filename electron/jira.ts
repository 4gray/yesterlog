import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  IssueDetailsRequest,
  IssueDetailsResult,
  JiraActivity,
  JiraActivitySyncRequest,
  JiraActivitySyncResult,
  JiraConnectionResult,
  JiraEpicInfo,
  JiraIssueDetails,
  JiraIssueSummary,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
  MoveWorklogRequest,
  MoveWorklogResult,
  SearchTicketsRequest,
  SearchTicketsResult,
  SyncDayBucket,
  SyncRequest,
  SyncResult,
  TicketsRequest,
  TicketsResult,
  TicketStatusCategory,
  TicketSortMode,
  UpdateWorklogRequest,
  UpdateWorklogResult
} from "../shared/types";
import { adfToPlainText } from "../shared/adf";

interface JiraUserResponse {
  accountId: string;
  displayName?: string;
}

interface JiraSearchIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    issuetype?: JiraIssueTypeResponse;
    parent?: JiraParentResponse;
    project?: { key?: string; name?: string };
    components?: Array<{ name?: string }>;
  };
}

interface JiraSearchResponse {
  issues?: JiraSearchIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

interface JiraTicketIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
    aggregatetimespent?: number | null;
    timetracking?: { timeSpentSeconds?: number };
    project?: { key?: string; name?: string };
    status?: { name?: string; statusCategory?: { key?: string } };
    issuetype?: JiraIssueTypeResponse;
    parent?: JiraParentResponse;
    created?: string;
    updated?: string;
    assignee?: { displayName?: string } | null;
  };
}

interface JiraTicketSearchResponse {
  issues?: JiraTicketIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

interface JiraActivityIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    issuetype?: JiraIssueTypeResponse;
    parent?: JiraParentResponse;
    project?: { key?: string; name?: string };
    components?: Array<{ name?: string }>;
    created?: string;
    creator?: JiraUserResponse;
  };
}

interface JiraActivitySearchResponse {
  issues?: JiraActivityIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

interface JiraCommentResponse {
  startAt: number;
  maxResults: number;
  total: number;
  comments?: Array<{
    id: string;
    author?: JiraUserResponse;
    updateAuthor?: JiraUserResponse;
    created?: string;
    updated?: string;
    body?: unknown;
  }>;
}

interface JiraChangelogItem {
  field?: string;
  fieldId?: string;
  fromString?: string | null;
  toString?: string | null;
}

interface JiraChangelogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  values?: Array<{
    id: string;
    author?: JiraUserResponse;
    created?: string;
    items?: JiraChangelogItem[];
  }>;
}

interface JiraWorklogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  worklogs?: Array<{
    id: string;
    issueId?: string;
    author?: {
      accountId?: string;
      displayName?: string;
    };
    started: string;
    timeSpentSeconds: number;
    comment?: unknown;
    created?: string;
    updated?: string;
  }>;
}

interface JiraChangedWorklogsResponse {
  since: number;
  until: number;
  lastPage: boolean;
  nextPage?: string;
  values?: Array<{
    worklogId: number;
    updatedTime: number;
  }>;
}

interface JiraDeletedWorklogsResponse {
  since: number;
  until: number;
  lastPage: boolean;
  nextPage?: string;
  values?: Array<{
    worklogId: number;
    updatedTime: number;
  }>;
}

interface JiraIssueTypeResponse {
  name?: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

interface JiraParentResponse {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    issuetype?: JiraIssueTypeResponse;
  };
}

class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "JiraApiError";
  }
}

const ensureSettings = (settings: AppSettings) => {
  if (!settings.jiraBaseUrl.trim()) {
    throw new JiraApiError("Add your Jira base URL first.");
  }

  if (!settings.jiraEmail.trim() || !settings.jiraApiToken.trim()) {
    throw new JiraApiError("Add your Jira email and API token first.");
  }
};

const normalizeBaseUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  const candidate = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed.includes(".") ? trimmed : `${trimmed}.atlassian.net`}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new JiraApiError("Jira site must look like company, company.atlassian.net, or https://company.atlassian.net.");
  }

  if (url.protocol !== "https:") {
    throw new JiraApiError("Jira base URL must start with https://.");
  }

  return `${url.protocol}//${url.host}`;
};

const authHeader = (settings: AppSettings) => {
  return `Basic ${Buffer.from(`${settings.jiraEmail}:${settings.jiraApiToken}`).toString("base64")}`;
};

const parseJiraError = async (response: Response) => {
  const fallback = `${response.status} ${response.statusText}`;

  try {
    const body = (await response.json()) as {
      errorMessages?: string[];
      errors?: Record<string, string>;
      message?: string;
    };

    const messages = [
      ...(body.errorMessages ?? []),
      ...Object.values(body.errors ?? {}),
      body.message
    ].filter(Boolean);

    return messages.length ? messages.join(" ") : fallback;
  } catch {
    return fallback;
  }
};

const JIRA_REQUEST_TIMEOUT_MS = 30_000;
const JIRA_REQUEST_ATTEMPTS = 3;
const MAX_BACKOFF_DELAY_MS = 60_000;

const retryAfterMs = (response: Response, attempt: number) => {
  const raw = response.headers.get("Retry-After")?.trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }
    const date = new Date(raw).getTime();
    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
  }

  const exponential = 500 * 2 ** attempt;
  return Math.min(exponential + Math.floor(Math.random() * 250), MAX_BACKOFF_DELAY_MS);
};

const waitForRetry = (delayMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, delayMs);
});

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  safeRead: boolean
) => {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const forwardAbort = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) {
    forwardAbort();
  } else {
    upstreamSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), JIRA_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      throw new JiraApiError(
        safeRead
          ? `Jira request timed out after ${JIRA_REQUEST_TIMEOUT_MS / 1_000}s.`
          : `Jira write timed out after ${JIRA_REQUEST_TIMEOUT_MS / 1_000}s. Jira may have accepted it; check Jira before retrying.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", forwardAbort);
  }
};

interface JiraRequestInit extends RequestInit {
  /** Some Jira read APIs use POST for a non-mutating bulk lookup. */
  retryableRead?: boolean;
}

const jiraFetch = async (settings: AppSettings, path: string, init: JiraRequestInit = {}) => {
  ensureSettings(settings);
  const baseUrl = normalizeBaseUrl(settings.jiraBaseUrl);
  const { retryableRead = false, ...fetchInit } = init;
  const requestInit: RequestInit = {
    ...fetchInit,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(settings),
      ...(fetchInit.headers ?? {})
    }
  };
  const method = (requestInit.method ?? "GET").toUpperCase();
  const safeRead = method === "GET" || retryableRead;
  let response: Response | undefined;

  for (let attempt = 0; attempt < JIRA_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchWithTimeout(`${baseUrl}${path}`, requestInit, safeRead);
    } catch (error) {
      if (error instanceof JiraApiError || !safeRead || attempt === JIRA_REQUEST_ATTEMPTS - 1) {
        throw error;
      }
      const delayMs = retryAfterMs(new Response(null), attempt);
      console.warn(`Retrying Jira ${method} ${path} after a network failure in ${delayMs}ms.`);
      await waitForRetry(delayMs);
      continue;
    }

    const shouldRetry =
      response.status === 429 ||
      (safeRead && [502, 503, 504].includes(response.status));
    if (!shouldRetry || attempt === JIRA_REQUEST_ATTEMPTS - 1) {
      break;
    }

    const delayMs = retryAfterMs(response, attempt);
    const reason = response.headers.get("RateLimit-Reason") ?? response.statusText ?? String(response.status);
    console.warn(`Retrying Jira ${method} ${path} after ${response.status} (${reason}) in ${delayMs}ms.`);
    await response.body?.cancel().catch(() => undefined);
    await waitForRetry(delayMs);
  }

  if (!response) {
    throw new JiraApiError("Jira request failed before receiving a response.");
  }

  if (!response.ok) {
    const message = await parseJiraError(response);

    if (response.status === 401 || response.status === 403) {
      throw new JiraApiError(`Jira rejected the credentials or permissions: ${message}`, response.status);
    }

    throw new JiraApiError(`Jira request failed: ${message}`, response.status);
  }

  return response;
};

const jiraRequest = async <T>(settings: AppSettings, path: string, init: JiraRequestInit = {}) => {
  const response = await jiraFetch(settings, path, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const mergeIssue = (bucket: SyncDayBucket, issue: JiraIssueSummary) => {
  const existing = bucket.issues.find((candidate) => candidate.key === issue.key);

  if (existing) {
    existing.loggedSeconds += issue.loggedSeconds;

    if (!existing.issueType && issue.issueType) {
      existing.issueType = issue.issueType;
    }

    if (!existing.epic && issue.epic) {
      existing.epic = issue.epic;
    }

    if (issue.comments?.length) {
      existing.comments = Array.from(new Set([...(existing.comments ?? []), ...issue.comments]));
    }

    return;
  }

  bucket.issues.push(issue);
};

const fetchCurrentUser = (settings: AppSettings) => {
  return jiraRequest<JiraUserResponse>(settings, "/rest/api/3/myself");
};

const normalizeIssueType = (issueType?: JiraIssueTypeResponse): JiraIssueTypeInfo | undefined => {
  if (!issueType) {
    return undefined;
  }

  return {
    name: issueType.name,
    subtask: issueType.subtask,
    hierarchyLevel: issueType.hierarchyLevel
  };
};

const normalizeEpic = (settings: AppSettings, parent?: JiraParentResponse): JiraEpicInfo | undefined => {
  if (!parent?.key) {
    return undefined;
  }

  const parentType = normalizeIssueType(parent.fields?.issuetype);
  const normalizedName = parentType?.name?.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (normalizedName !== "epic" && (parentType?.hierarchyLevel ?? 0) < 1) {
    return undefined;
  }

  return {
    id: parent.id,
    key: parent.key,
    summary: parent.fields?.summary ?? parent.key,
    url: `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${parent.key}`
  };
};

const sameAccount = (user: JiraUserResponse | undefined, currentUser: JiraUserResponse) =>
  user?.accountId === currentUser.accountId;

const parseJiraDate = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const isWithinRange = (value: string | undefined, start: Date, endExclusive: Date) => {
  const date = parseJiraDate(value);
  return Boolean(date && date >= start && date < endExclusive);
};

const issueSummary = (issue: JiraActivityIssue) => issue.fields?.summary ?? "Untitled Jira issue";

const activityIssueUrl = (settings: AppSettings, issueKey: string) => `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${issueKey}`;

const issueProductContext = (issue: { fields?: JiraSearchIssue["fields"] | JiraActivityIssue["fields"] }) => ({
  projectKey: issue.fields?.project?.key,
  projectName: issue.fields?.project?.name,
  components: issue.fields?.components?.map((component) => component.name?.trim()).filter(Boolean) as string[] | undefined
});

const formatChangedValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? `"${trimmed}"` : "empty";
};

const fieldLabel = (item: JiraChangelogItem) => item.field?.trim() || item.fieldId?.trim() || "field";

const isStatusChange = (item: JiraChangelogItem) => {
  const normalizedField = fieldLabel(item).toLowerCase();
  return normalizedField === "status" || item.fieldId?.toLowerCase() === "status";
};

const isWorklogOrTimeTrackingChange = (item: JiraChangelogItem) => {
  const normalized = `${item.field ?? ""} ${item.fieldId ?? ""}`.toLowerCase();
  return [
    "worklog",
    "timespent",
    "time spent",
    "timeestimate",
    "remaining estimate",
    "timeoriginalestimate",
    "original estimate",
    "aggregatetimespent",
    "aggregatetimeestimate",
    "aggregatetimeoriginalestimate",
    "timetracking",
    "time tracking"
  ].some((token) => normalized.includes(token));
};

const compactFieldsLabel = (items: JiraChangelogItem[]) => {
  const labels = Array.from(new Set(items.map(fieldLabel))).filter(Boolean);
  const visible = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${visible} +${labels.length - 3}` : visible || "fields";
};

const buildIssueCreatedActivity = (
  settings: AppSettings,
  issue: JiraActivityIssue,
  currentUser: JiraUserResponse,
  weekStart: Date,
  weekEndExclusive: Date
): JiraActivity | undefined => {
  const created = issue.fields?.created;
  const actor = sameAccount(issue.fields?.creator, currentUser) ? issue.fields?.creator : undefined;

  if (!actor || !isWithinRange(created, weekStart, weekEndExclusive)) {
    return undefined;
  }

  const createdDate = parseJiraDate(created)!;
  const summary = issueSummary(issue);
  return {
    id: `jira:${issue.key}:created:${created}`,
    kind: "issue-created",
    issueId: issue.id,
    issueKey: issue.key,
    issueSummary: summary,
    issueUrl: activityIssueUrl(settings, issue.key),
    issueType: normalizeIssueType(issue.fields?.issuetype),
    epic: normalizeEpic(settings, issue.fields?.parent),
    ...issueProductContext(issue),
    actorAccountId: currentUser.accountId,
    actorDisplayName: actor.displayName ?? currentUser.displayName,
    dateKey: toDateKey(createdDate),
    occurredAt: created!,
    title: `Created Jira issue: ${summary}`,
    description: `Created Jira issue ${issue.key}: ${summary}.`,
    estimatedSeconds: 20 * 60,
    confidence: "medium"
  };
};

const buildCommentActivities = (
  settings: AppSettings,
  issue: JiraActivityIssue,
  comments: NonNullable<JiraCommentResponse["comments"]>,
  currentUser: JiraUserResponse,
  weekStart: Date,
  weekEndExclusive: Date
): JiraActivity[] => {
  const activities: JiraActivity[] = [];
  const summary = issueSummary(issue);
  const common = {
    issueId: issue.id,
    issueKey: issue.key,
    issueSummary: summary,
    issueUrl: activityIssueUrl(settings, issue.key),
    issueType: normalizeIssueType(issue.fields?.issuetype),
    epic: normalizeEpic(settings, issue.fields?.parent),
    ...issueProductContext(issue),
    actorAccountId: currentUser.accountId
  };

  for (const comment of comments) {
    const body = adfToPlainText(comment.body);
    const createdDate = parseJiraDate(comment.created);
    const updatedDate = parseJiraDate(comment.updated);

    if (sameAccount(comment.author, currentUser) && createdDate && createdDate >= weekStart && createdDate < weekEndExclusive) {
      activities.push({
        ...common,
        id: `jira:${issue.key}:comment:${comment.id}:created:${comment.created}`,
        kind: "comment",
        actorDisplayName: comment.author?.displayName ?? currentUser.displayName,
        dateKey: toDateKey(createdDate),
        occurredAt: comment.created!,
        title: `Commented on ${issue.key}`,
        description: body ? `Commented on ${issue.key}: ${body}` : `Commented on Jira issue ${issue.key}.`,
        commentId: comment.id,
        commentBody: body || undefined,
        estimatedSeconds: 15 * 60,
        confidence: body ? "medium" : "low"
      });
    }

    if (
      sameAccount(comment.updateAuthor, currentUser) &&
      updatedDate &&
      updatedDate >= weekStart &&
      updatedDate < weekEndExclusive &&
      comment.updated !== comment.created
    ) {
      activities.push({
        ...common,
        id: `jira:${issue.key}:comment:${comment.id}:updated:${comment.updated}`,
        kind: "comment",
        actorDisplayName: comment.updateAuthor?.displayName ?? currentUser.displayName,
        dateKey: toDateKey(updatedDate),
        occurredAt: comment.updated!,
        title: `Updated comment on ${issue.key}`,
        description: body ? `Updated a Jira comment on ${issue.key}: ${body}` : `Updated a Jira comment on ${issue.key}.`,
        commentId: comment.id,
        commentBody: body || undefined,
        estimatedSeconds: 10 * 60,
        confidence: body ? "medium" : "low"
      });
    }
  }

  return activities;
};

const buildChangelogActivities = (
  settings: AppSettings,
  issue: JiraActivityIssue,
  histories: NonNullable<JiraChangelogResponse["values"]>,
  currentUser: JiraUserResponse,
  weekStart: Date,
  weekEndExclusive: Date
): JiraActivity[] => {
  const summary = issueSummary(issue);
  const activities: JiraActivity[] = [];
  const common = {
    issueId: issue.id,
    issueKey: issue.key,
    issueSummary: summary,
    issueUrl: activityIssueUrl(settings, issue.key),
    issueType: normalizeIssueType(issue.fields?.issuetype),
    epic: normalizeEpic(settings, issue.fields?.parent),
    ...issueProductContext(issue),
    actorAccountId: currentUser.accountId
  };

  for (const history of histories) {
    const occurredAt = parseJiraDate(history.created);
    if (!sameAccount(history.author, currentUser) || !occurredAt || occurredAt < weekStart || occurredAt >= weekEndExclusive) {
      continue;
    }

    const items = (history.items ?? []).filter((item) => !isWorklogOrTimeTrackingChange(item));
    if (items.length === 0) {
      continue;
    }

    const statusItem = items.find(isStatusChange);
    if (statusItem) {
      activities.push({
        ...common,
        id: `jira:${issue.key}:changelog:${history.id}:status:${history.created}`,
        kind: "status-change",
        actorDisplayName: history.author?.displayName ?? currentUser.displayName,
        dateKey: toDateKey(occurredAt),
        occurredAt: history.created!,
        title: `Moved ${issue.key}`,
        description: `Changed ${issue.key} status from ${formatChangedValue(statusItem.fromString)} to ${formatChangedValue(statusItem.toString)}.`,
        fieldName: fieldLabel(statusItem),
        fromValue: statusItem.fromString ?? undefined,
        toValue: statusItem.toString ?? undefined,
        estimatedSeconds: 10 * 60,
        confidence: "medium"
      });
      continue;
    }

    const fields = compactFieldsLabel(items);
    const first = items[0];
    activities.push({
      ...common,
      id: `jira:${issue.key}:changelog:${history.id}:fields:${history.created}`,
      kind: "field-change",
      actorDisplayName: history.author?.displayName ?? currentUser.displayName,
      dateKey: toDateKey(occurredAt),
      occurredAt: history.created!,
      title: `Updated Jira fields on ${issue.key}`,
      description:
        items.length === 1
          ? `Changed ${fieldLabel(first)} on ${issue.key} from ${formatChangedValue(first.fromString)} to ${formatChangedValue(first.toString)}.`
          : `Updated ${fields} on Jira issue ${issue.key}.`,
      fieldName: fields,
      fromValue: items.length === 1 ? first.fromString ?? undefined : undefined,
      toValue: items.length === 1 ? first.toString ?? undefined : undefined,
      estimatedSeconds: 0,
      confidence: "low"
    });
  }

  return activities;
};

export const testJiraConnection = async (settings: AppSettings): Promise<JiraConnectionResult> => {
  try {
    const user = await fetchCurrentUser(settings);
    return {
      ok: true,
      message: `Connected as ${user.displayName ?? settings.jiraEmail}.`,
      accountId: user.accountId,
      displayName: user.displayName
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to connect to Jira."
    };
  }
};

const searchCandidateIssues = async (settings: AppSettings, weekStart: Date, weekEndExclusive: Date) => {
  const weekEndInclusive = new Date(weekEndExclusive);
  weekEndInclusive.setDate(weekEndInclusive.getDate() - 1);

  const jql = [
    "worklogAuthor = currentUser()",
    `AND worklogDate >= "${toDateKey(weekStart)}"`,
    `AND worklogDate <= "${toDateKey(weekEndInclusive)}"`,
    "ORDER BY updated DESC"
  ].join(" ");

  const issues: JiraSearchIssue[] = [];
  let nextPageToken: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams({
      jql,
      maxResults: "100",
      fields: "summary,issuetype,parent,project,components"
    });

    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }

    const page = await jiraRequest<JiraSearchResponse>(
      settings,
      `/rest/api/3/search/jql?${params.toString()}`
    );

    issues.push(...(page.issues ?? []));
    nextPageToken = page.nextPageToken;
    guard += 1;

    if (page.isLast !== false) {
      break;
    }
  } while (nextPageToken && guard < 50);

  return { issues, pageCount: guard };
};

// A selected week can be affected by a bulk worklog whose Jira `started` date
// sits in a neighbouring week. Keep this bounded: it is a read-only discovery
// window, not an unbounded account-history import.
const BULK_WORKLOG_SCAN_DAYS = 90;

const shiftDate = (date: Date, days: number) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const bulkWorklogScanBounds = (weekStart: Date, weekEndExclusive: Date, now = new Date()) => {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const proposedEnd = shiftDate(weekEndExclusive, BULK_WORKLOG_SCAN_DAYS);
  return {
    scanStart: shiftDate(weekStart, -BULK_WORKLOG_SCAN_DAYS),
    scanEndExclusive: proposedEnd < tomorrow ? proposedEnd : tomorrow
  };
};

const fetchIssueWorklogs = async (
  settings: AppSettings,
  issueKey: string,
  weekStart: Date,
  weekEndExclusive: Date
) => {
  const worklogs: JiraWorklogResponse["worklogs"] = [];
  let startAt = 0;
  let total = 0;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: "100",
      startedAfter: String(weekStart.getTime() - 1),
      startedBefore: String(weekEndExclusive.getTime())
    });

    const page = await jiraRequest<JiraWorklogResponse>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?${params.toString()}`
    );

    worklogs.push(...(page.worklogs ?? []));
    total = page.total;
    startAt = page.startAt + page.maxResults;
    pageCount += 1;
  } while (startAt < total && pageCount < 50);

  return { worklogs, pageCount };
};

const normalizeWorklog = (
  settings: AppSettings,
  issue: JiraSearchIssue,
  worklog: NonNullable<JiraWorklogResponse["worklogs"]>[number],
  authorAccountId: string
): JiraWorklog => {
  const summary = issue.fields?.summary ?? "Untitled Jira issue";
  return {
    id: worklog.id,
    issueId: issue.id,
    issueKey: issue.key,
    issueSummary: summary,
    issueUrl: `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${issue.key}`,
    issueType: normalizeIssueType(issue.fields?.issuetype),
    epic: normalizeEpic(settings, issue.fields?.parent),
    ...issueProductContext(issue),
    authorAccountId,
    started: worklog.started,
    timeSpentSeconds: worklog.timeSpentSeconds,
    comment: adfToPlainText(worklog.comment) || undefined,
    created: worklog.created,
    updated: worklog.updated
  };
};

const scanWorklogRange = async (
  settings: AppSettings,
  currentUser: JiraUserResponse,
  scanStart: Date,
  scanEndExclusive: Date
) => {
  const candidateSearch = await searchCandidateIssues(settings, scanStart, scanEndExclusive);
  const sourceWorklogs: JiraWorklog[] = [];
  let requestCount = candidateSearch.pageCount;

  for (const issue of candidateSearch.issues) {
    const fetched = await fetchIssueWorklogs(settings, issue.key, scanStart, scanEndExclusive);
    requestCount += fetched.pageCount;

    for (const worklog of fetched.worklogs) {
      const startedDate = new Date(worklog.started);
      if (
        worklog.author?.accountId !== currentUser.accountId ||
        Number.isNaN(startedDate.getTime()) ||
        startedDate < scanStart ||
        startedDate >= scanEndExclusive
      ) {
        continue;
      }
      sourceWorklogs.push(normalizeWorklog(settings, issue, worklog, currentUser.accountId));
    }
  }

  return {
    sourceWorklogs,
    candidateIssueCount: candidateSearch.issues.length,
    requestCount
  };
};

const summarizeWorklogs = (
  sourceWorklogs: JiraWorklog[],
  weekStart: Date,
  weekEndExclusive: Date
) => {
  const daySummaries: SyncResult["daySummaries"] = {};
  const visibleWorklogIds = new Set<string>();
  const visibleIssueKeys = new Set<string>();

  for (const worklog of sourceWorklogs) {
    const startedDate = new Date(worklog.started);
    if (Number.isNaN(startedDate.getTime()) || startedDate < weekStart || startedDate >= weekEndExclusive) {
      continue;
    }

    const dateKey = toDateKey(startedDate);
    const bucket = daySummaries[dateKey] ?? {
      trackedSeconds: 0,
      issues: [],
      worklogs: []
    };
    bucket.trackedSeconds += worklog.timeSpentSeconds;
    bucket.worklogs.push(worklog);
    mergeIssue(bucket, {
      id: worklog.issueId,
      key: worklog.issueKey,
      summary: worklog.issueSummary,
      url: worklog.issueUrl,
      issueType: worklog.issueType,
      epic: worklog.epic,
      loggedSeconds: worklog.timeSpentSeconds,
      comments: worklog.comment ? [worklog.comment] : []
    });
    daySummaries[dateKey] = bucket;
    visibleWorklogIds.add(worklog.id);
    visibleIssueKeys.add(worklog.issueKey);
  }

  for (const bucket of Object.values(daySummaries)) {
    bucket.worklogs.sort((left, right) => new Date(left.started).getTime() - new Date(right.started).getTime());
  }

  const trackedSeconds = Object.values(daySummaries).reduce((sum, bucket) => sum + bucket.trackedSeconds, 0);

  return {
    trackedSeconds,
    issueCount: visibleIssueKeys.size,
    worklogCount: visibleWorklogIds.size,
    daySummaries
  };
};

const buildWorklogSyncResult = ({
  request,
  currentUser,
  sourceWorklogs,
  scanStart,
  scanEndExclusive,
  worklogSyncCursorMs,
  diagnostics
}: {
  request: SyncRequest;
  currentUser: JiraUserResponse;
  sourceWorklogs: JiraWorklog[];
  scanStart: Date;
  scanEndExclusive: Date;
  worklogSyncCursorMs: number;
  diagnostics: NonNullable<SyncResult["diagnostics"]>;
}): SyncResult => {
  const weekStart = new Date(request.weekStartISO);
  const weekEndExclusive = new Date(request.weekEndExclusiveISO);
  const summary = summarizeWorklogs(sourceWorklogs, weekStart, weekEndExclusive);

  return {
    weekKey: request.weekKey,
    weekStartISO: request.weekStartISO,
    weekEndExclusiveISO: request.weekEndExclusiveISO,
    syncedAt: new Date().toISOString(),
    accountId: currentUser.accountId,
    jiraSite: normalizeBaseUrl(request.settings.jiraBaseUrl),
    displayName: currentUser.displayName,
    ...summary,
    sourceWorklogs,
    scanStartISO: scanStart.toISOString(),
    scanEndExclusiveISO: scanEndExclusive.toISOString(),
    worklogSyncCursorMs,
    diagnostics
  };
};

const changedWorklogIds = async (
  settings: AppSettings,
  kind: "updated" | "deleted",
  since: number
) => {
  const ids = new Set<string>();
  let cursor = since;
  let safeUntil = since;
  let pageCount = 0;
  let path = `/rest/api/3/worklog/${kind}?${new URLSearchParams({ since: String(since) }).toString()}`;

  while (pageCount < 50) {
    const page = await jiraRequest<JiraChangedWorklogsResponse | JiraDeletedWorklogsResponse>(
      settings,
      path
    );
    for (const value of page.values ?? []) {
      ids.add(String(value.worklogId));
    }
    pageCount += 1;
    safeUntil = Math.max(safeUntil, page.until ?? cursor);
    if (page.lastPage || !Number.isFinite(page.until) || page.until <= cursor) {
      break;
    }
    cursor = page.until;
    if (page.nextPage) {
      const jiraOrigin = normalizeBaseUrl(settings.jiraBaseUrl);
      const next = new URL(page.nextPage, jiraOrigin);
      if (next.origin !== jiraOrigin) {
        throw new JiraApiError("Jira returned an invalid worklog pagination URL.");
      }
      path = `${next.pathname}${next.search}`;
    } else {
      path = `/rest/api/3/worklog/${kind}?${new URLSearchParams({ since: String(cursor) }).toString()}`;
    }
  }

  return { ids: [...ids], safeUntil, pageCount };
};

const WORKLOG_LIST_BATCH_SIZE = 1_000;

const fetchWorklogsByIds = async (settings: AppSettings, ids: string[]) => {
  const worklogs: NonNullable<JiraWorklogResponse["worklogs"]> = [];
  let requestCount = 0;

  for (let index = 0; index < ids.length; index += WORKLOG_LIST_BATCH_SIZE) {
    const batch = ids.slice(index, index + WORKLOG_LIST_BATCH_SIZE).map(Number).filter(Number.isFinite);
    if (batch.length === 0) {
      continue;
    }
    const response = await jiraRequest<NonNullable<JiraWorklogResponse["worklogs"]>>(
      settings,
      "/rest/api/3/worklog/list",
      {
        method: "POST",
        retryableRead: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch })
      }
    );
    worklogs.push(...response);
    requestCount += 1;
  }

  return { worklogs, requestCount };
};

const fetchIssuesByIds = async (settings: AppSettings, issueIds: string[]) => {
  const uniqueIds = [...new Set(issueIds)];
  const issues = await mapWithConcurrency(uniqueIds, 4, async (issueId) => {
    const params = new URLSearchParams({ fields: "summary,issuetype,parent,project,components" });
    return jiraRequest<JiraSearchIssue>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueId)}?${params.toString()}`
    );
  });
  return { issues, requestCount: uniqueIds.length };
};

const logWorklogSyncDiagnostics = (result: SyncResult) => {
  const diagnostics = result.diagnostics;
  if (!diagnostics) return;
  console.info(
    `[Jira worklog sync] ${diagnostics.mode} completed in ${diagnostics.durationMs}ms ` +
    `with ${diagnostics.requestCount} requests, ${result.worklogCount} visible worklogs.`
  );
};

const fullWorklogSync = async (
  request: SyncRequest,
  currentUser: JiraUserResponse,
  startedAtMs: number,
  fallbackReason?: string
) => {
  const weekStart = new Date(request.weekStartISO);
  const weekEndExclusive = new Date(request.weekEndExclusiveISO);
  const { scanStart, scanEndExclusive } = bulkWorklogScanBounds(weekStart, weekEndExclusive);
  const scan = await scanWorklogRange(request.settings, currentUser, scanStart, scanEndExclusive);
  const result = buildWorklogSyncResult({
    request,
    currentUser,
    sourceWorklogs: scan.sourceWorklogs,
    scanStart,
    scanEndExclusive,
    // The feeds omit approximately the most recent minute. Overlap the next
    // delta with the start of this scan so concurrent changes are reconciled.
    worklogSyncCursorMs: Math.max(0, startedAtMs - 120_000),
    diagnostics: {
      mode: "full",
      durationMs: Date.now() - startedAtMs,
      requestCount: 1 + scan.requestCount,
      candidateIssueCount: scan.candidateIssueCount,
      fallbackReason
    }
  });
  logWorklogSyncDiagnostics(result);
  return result;
};

const baselineProblem = (
  request: SyncRequest,
  currentUser: JiraUserResponse,
  expectedScanStart: Date
) => {
  const baseline = request.baseline;
  if (!baseline) return "missing baseline";
  if (baseline.weekKey !== request.weekKey) return "baseline belongs to another week";
  if (baseline.accountId !== currentUser.accountId) return "baseline belongs to another Jira user";
  if (baseline.jiraSite && baseline.jiraSite !== normalizeBaseUrl(request.settings.jiraBaseUrl)) {
    return "baseline belongs to another Jira site";
  }
  if (baseline.sourceWorklogs === undefined) return "baseline has no raw worklog cache";
  if (!Number.isFinite(baseline.worklogSyncCursorMs)) return "baseline has no delta cursor";
  const scanStart = baseline.scanStartISO ? new Date(baseline.scanStartISO) : undefined;
  const scanEnd = baseline.scanEndExclusiveISO ? new Date(baseline.scanEndExclusiveISO) : undefined;
  if (!scanStart || !scanEnd || Number.isNaN(scanStart.getTime()) || Number.isNaN(scanEnd.getTime())) {
    return "baseline has no valid scan range";
  }
  if (scanStart > expectedScanStart) return "baseline does not cover the bulk-worklog lookback";
  return undefined;
};

const deltaWorklogSync = async (
  request: SyncRequest,
  currentUser: JiraUserResponse,
  startedAtMs: number
) => {
  const baseline = request.baseline!;
  const weekStart = new Date(request.weekStartISO);
  const weekEndExclusive = new Date(request.weekEndExclusiveISO);
  const { scanStart, scanEndExclusive } = bulkWorklogScanBounds(weekStart, weekEndExclusive);
  const previousScanEnd = new Date(baseline.scanEndExclusiveISO!);
  const previousCursor = baseline.worklogSyncCursorMs!;
  const [updatedFeed, deletedFeed] = await Promise.all([
    changedWorklogIds(request.settings, "updated", previousCursor),
    changedWorklogIds(request.settings, "deleted", previousCursor)
  ]);
  const changed = await fetchWorklogsByIds(request.settings, updatedFeed.ids);

  const cachedById = new Map((baseline.sourceWorklogs ?? []).map((worklog) => [worklog.id, worklog]));
  const cachedIssueIds = new Set(
    [...cachedById.values()].map((worklog) => worklog.issueId).filter((value): value is string => Boolean(value))
  );
  const missingIssueIds = changed.worklogs
    .filter((worklog) => {
      const started = new Date(worklog.started);
      return (
        worklog.author?.accountId === currentUser.accountId &&
        !Number.isNaN(started.getTime()) &&
        started >= scanStart &&
        started < scanEndExclusive
      );
    })
    .map((worklog) => worklog.issueId)
    .filter((issueId): issueId is string => Boolean(issueId && !cachedIssueIds.has(issueId)));
  const issueFetch = await fetchIssuesByIds(request.settings, missingIssueIds);
  const issuesById = new Map(issueFetch.issues.map((issue) => [issue.id, issue]));
  const cachedIssueById = new Map<string, JiraSearchIssue>();
  for (const worklog of cachedById.values()) {
    if (!worklog.issueId || cachedIssueById.has(worklog.issueId)) continue;
    cachedIssueById.set(worklog.issueId, {
      id: worklog.issueId,
      key: worklog.issueKey,
      fields: {
        summary: worklog.issueSummary,
        issuetype: worklog.issueType,
        parent: worklog.epic ? {
          id: worklog.epic.id,
          key: worklog.epic.key,
          fields: {
            summary: worklog.epic.summary,
            issuetype: { name: "Epic", hierarchyLevel: 1 }
          }
        } : undefined,
        project: worklog.projectKey ? { key: worklog.projectKey, name: worklog.projectName } : undefined,
        components: worklog.components?.map((name) => ({ name }))
      }
    });
  }

  const sourceById = new Map<string, JiraWorklog>();
  for (const worklog of baseline.sourceWorklogs ?? []) {
    const started = new Date(worklog.started);
    if (!Number.isNaN(started.getTime()) && started >= scanStart && started < scanEndExclusive) {
      sourceById.set(worklog.id, worklog);
    }
  }

  let extension = { sourceWorklogs: [] as JiraWorklog[], candidateIssueCount: 0, requestCount: 0 };
  if (previousScanEnd < scanEndExclusive) {
    extension = await scanWorklogRange(request.settings, currentUser, previousScanEnd, scanEndExclusive);
    for (const worklog of extension.sourceWorklogs) {
      sourceById.set(worklog.id, worklog);
    }
  }

  for (const raw of changed.worklogs) {
    sourceById.delete(raw.id);
    const started = new Date(raw.started);
    if (
      raw.author?.accountId !== currentUser.accountId ||
      Number.isNaN(started.getTime()) ||
      started < scanStart ||
      started >= scanEndExclusive
    ) {
      continue;
    }
    const issue = raw.issueId
      ? issuesById.get(raw.issueId) ?? cachedIssueById.get(raw.issueId)
      : undefined;
    if (issue) {
      sourceById.set(raw.id, normalizeWorklog(request.settings, issue, raw, currentUser.accountId));
    }
  }

  for (const deletedId of deletedFeed.ids) {
    sourceById.delete(deletedId);
  }

  const sourceWorklogs = [...sourceById.values()].sort(
    (left, right) => new Date(left.started).getTime() - new Date(right.started).getTime() || left.id.localeCompare(right.id)
  );
  const feedUntil = Math.min(updatedFeed.safeUntil, deletedFeed.safeUntil);
  const worklogSyncCursorMs = Math.max(previousCursor, feedUntil - 1_000);
  const result = buildWorklogSyncResult({
    request,
    currentUser,
    sourceWorklogs,
    scanStart,
    scanEndExclusive,
    worklogSyncCursorMs,
    diagnostics: {
      mode: "delta",
      durationMs: Date.now() - startedAtMs,
      requestCount:
        1 +
        updatedFeed.pageCount +
        deletedFeed.pageCount +
        changed.requestCount +
        issueFetch.requestCount +
        extension.requestCount,
      changedWorklogCount: updatedFeed.ids.length,
      deletedWorklogCount: deletedFeed.ids.length,
      extendedRangeIssueCount: extension.candidateIssueCount || undefined
    }
  });
  logWorklogSyncDiagnostics(result);
  return result;
};

export const syncJiraWorklogs = async (request: SyncRequest): Promise<SyncResult> => {
  const startedAtMs = Date.now();
  const currentUser = await fetchCurrentUser(request.settings);
  const weekStart = new Date(request.weekStartISO);
  const { scanStart } = bulkWorklogScanBounds(weekStart, new Date(request.weekEndExclusiveISO));

  if (request.mode === "delta") {
    const problem = baselineProblem(request, currentUser, scanStart);
    if (!problem) {
      try {
        return await deltaWorklogSync(request, currentUser, startedAtMs);
      } catch (error) {
        if (!(error instanceof JiraApiError) || ![400, 403, 404].includes(error.status ?? 0)) {
          throw error;
        }
        return fullWorklogSync(
          request,
          currentUser,
          startedAtMs,
          `delta API unavailable (${error.status})`
        );
      }
    }
    return fullWorklogSync(request, currentUser, startedAtMs, problem);
  }

  return fullWorklogSync(request, currentUser, startedAtMs);
};

const ACTIVITY_ISSUE_FIELDS = "summary,issuetype,parent,project,components,created,creator";
const ACTIVITY_ISSUE_LIMIT = 50;
const ACTIVITY_DETAIL_PAGE_LIMIT = 3;
const ACTIVITY_DETAIL_CONCURRENCY = 4;

interface ActivityIssueSearchResult {
  issues: JiraActivityIssue[];
  isPartial: boolean;
  truncatedIssueCount: number;
}

interface ActivityPagedResult<T> {
  items: T[];
  isPartial: boolean;
}

interface ActivityIssueDetails {
  issue: JiraActivityIssue;
  comments: NonNullable<JiraCommentResponse["comments"]>;
  changelogs: NonNullable<JiraChangelogResponse["values"]>;
  isPartial: boolean;
  skipped: boolean;
}

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  concurrency: number,
  fn: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results: Output[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const searchActivityIssuesForUser = async (
  settings: AppSettings,
  userIdentifier: string,
  weekStart: Date,
  weekEndExclusive: Date
): Promise<ActivityIssueSearchResult> => {
  const weekEndInclusive = new Date(weekEndExclusive);
  weekEndInclusive.setDate(weekEndInclusive.getDate() - 1);
  const jql = [
    `issuekey in updatedBy("${escapeJqlString(userIdentifier)}", "${toDateKey(weekStart)}", "${toDateKey(weekEndInclusive)}")`,
    "ORDER BY updated DESC"
  ].join(" ");

  const issues: JiraActivityIssue[] = [];
  let isPartial = false;
  let nextPageToken: string | undefined;
  let guard = 0;

  do {
    const remaining = ACTIVITY_ISSUE_LIMIT - issues.length;
    const params = new URLSearchParams({
      jql,
      maxResults: String(Math.min(100, remaining)),
      fields: ACTIVITY_ISSUE_FIELDS
    });

    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }

    const page = await jiraRequest<JiraActivitySearchResponse>(
      settings,
      `/rest/api/3/search/jql?${params.toString()}`
    );

    issues.push(...(page.issues ?? []));
    nextPageToken = page.nextPageToken;
    guard += 1;

    if (issues.length >= ACTIVITY_ISSUE_LIMIT && page.isLast === false) {
      isPartial = true;
      break;
    }

    if (page.isLast !== false) {
      break;
    }
  } while (nextPageToken && guard < 50);

  if (nextPageToken && guard >= 50) {
    isPartial = true;
  }

  return {
    issues: issues.slice(0, ACTIVITY_ISSUE_LIMIT),
    isPartial,
    truncatedIssueCount: isPartial ? Math.max(1, issues.length - ACTIVITY_ISSUE_LIMIT) : 0
  };
};

const searchActivityIssues = async (
  settings: AppSettings,
  currentUser: JiraUserResponse,
  weekStart: Date,
  weekEndExclusive: Date
): Promise<ActivityIssueSearchResult> => {
  const identifiers = Array.from(
    new Set([currentUser.accountId, currentUser.displayName, settings.jiraEmail].filter((value): value is string => Boolean(value)))
  );
  let queryError: unknown;

  for (const identifier of identifiers) {
    try {
      return await searchActivityIssuesForUser(settings, identifier, weekStart, weekEndExclusive);
    } catch (error) {
      if (error instanceof JiraApiError && error.status === 400) {
        queryError = error;
        continue;
      }
      throw error;
    }
  }

  throw queryError instanceof Error ? queryError : new JiraApiError("Unable to search Jira activity.");
};

const fetchIssueComments = async (settings: AppSettings, issueKey: string) => {
  const comments: NonNullable<JiraCommentResponse["comments"]> = [];
  let startAt = 0;
  let total = 0;
  let pageCount = 0;
  let isPartial = false;

  do {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: "100",
      orderBy: "created"
    });

    const page = await jiraRequest<JiraCommentResponse>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`
    );

    comments.push(...(page.comments ?? []));
    total = page.total;
    startAt = page.startAt + page.maxResults;
    pageCount += 1;
    if (startAt < total && pageCount >= ACTIVITY_DETAIL_PAGE_LIMIT) {
      isPartial = true;
      break;
    }
  } while (startAt < total);

  return { items: comments, isPartial } satisfies ActivityPagedResult<NonNullable<JiraCommentResponse["comments"]>[number]>;
};

const fetchRecentIssueComments = async (
  settings: AppSettings,
  issueKey: string,
  limit: number
) => {
  const pageSize = Math.max(1, limit);
  const params = new URLSearchParams({
    startAt: "0",
    maxResults: String(pageSize),
    orderBy: "created"
  });
  const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`;
  const firstPage = await jiraRequest<JiraCommentResponse>(
    settings,
    `${path}?${params.toString()}`
  );
  const firstComments = firstPage.comments ?? [];
  const total = Math.max(0, firstPage.total);

  if (total <= firstComments.length) {
    return firstComments.slice(-limit);
  }

  params.set("startAt", String(Math.max(0, total - limit)));
  const lastPage = await jiraRequest<JiraCommentResponse>(
    settings,
    `${path}?${params.toString()}`
  );
  return (lastPage.comments ?? []).slice(-limit);
};

const fetchIssueChangelogs = async (settings: AppSettings, issueKey: string) => {
  const histories: NonNullable<JiraChangelogResponse["values"]> = [];
  let startAt = 0;
  let total = 0;
  let pageCount = 0;
  let isPartial = false;

  do {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: "100"
    });

    const page = await jiraRequest<JiraChangelogResponse>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?${params.toString()}`
    );

    histories.push(...(page.values ?? []));
    total = page.total;
    startAt = page.startAt + page.maxResults;
    pageCount += 1;
    if (startAt < total && pageCount >= ACTIVITY_DETAIL_PAGE_LIMIT) {
      isPartial = true;
      break;
    }
  } while (startAt < total);

  return { items: histories, isPartial } satisfies ActivityPagedResult<NonNullable<JiraChangelogResponse["values"]>[number]>;
};

export const syncJiraActivity = async (request: JiraActivitySyncRequest): Promise<JiraActivitySyncResult> => {
  const { settings, weekStartISO, weekEndExclusiveISO, weekKey } = request;
  const weekStart = new Date(weekStartISO);
  const weekEndExclusive = new Date(weekEndExclusiveISO);
  const currentUser = await fetchCurrentUser(settings);
  const issueSearch = await searchActivityIssues(settings, currentUser, weekStart, weekEndExclusive);
  const candidateIssues = issueSearch.issues;
  const activitiesById = new Map<string, JiraActivity>();

  const issueDetails = await mapWithConcurrency(
    candidateIssues,
    ACTIVITY_DETAIL_CONCURRENCY,
    async (issue): Promise<ActivityIssueDetails> => {
      try {
        const [comments, changelogs] = await Promise.all([
          fetchIssueComments(settings, issue.key),
          fetchIssueChangelogs(settings, issue.key)
        ]);
        return {
          issue,
          comments: comments.items,
          changelogs: changelogs.items,
          isPartial: comments.isPartial || changelogs.isPartial,
          skipped: false
        };
      } catch {
        return { issue, comments: [], changelogs: [], isPartial: true, skipped: true };
      }
    }
  );

  for (const { issue, comments, changelogs } of issueDetails) {
    const created = buildIssueCreatedActivity(settings, issue, currentUser, weekStart, weekEndExclusive);
    if (created) {
      activitiesById.set(created.id, created);
    }

    for (const activity of buildCommentActivities(settings, issue, comments, currentUser, weekStart, weekEndExclusive)) {
      activitiesById.set(activity.id, activity);
    }

    for (const activity of buildChangelogActivities(settings, issue, changelogs, currentUser, weekStart, weekEndExclusive)) {
      activitiesById.set(activity.id, activity);
    }
  }

  const activities = Array.from(activitiesById.values()).sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
  const skippedIssueCount = issueDetails.filter((detail) => detail.skipped).length;
  const truncatedDetailIssueCount = issueDetails.filter((detail) => detail.isPartial && !detail.skipped).length;
  const isPartial = issueSearch.isPartial || skippedIssueCount > 0 || truncatedDetailIssueCount > 0;

  return {
    weekKey,
    weekStartISO,
    weekEndExclusiveISO,
    syncedAt: new Date().toISOString(),
    accountId: currentUser.accountId,
    displayName: currentUser.displayName,
    issueCount: candidateIssues.length,
    activityCount: activities.length,
    activities,
    isPartial: isPartial || undefined,
    scannedIssueCount: candidateIssues.length,
    skippedIssueCount: skippedIssueCount || undefined,
    truncatedIssueCount: issueSearch.truncatedIssueCount || undefined,
    truncatedDetailIssueCount: truncatedDetailIssueCount || undefined
  };
};

const TICKET_FIELDS = "summary,status,project,timetracking,aggregatetimespent,issuetype,parent,created,updated,assignee";
const ISSUE_DETAILS_FIELDS = `${TICKET_FIELDS},description`;
const ISSUE_DETAILS_COMMENT_LIMIT = 20;
const TICKET_PAGE_SIZE = 100;
const ASSIGNED_OPEN_TICKET_LIMIT = 500;
const RECENTLY_CLOSED_TICKET_LIMIT = 50;
const DEFAULT_SEARCH_TICKET_LIMIT = 20;
const MAX_SEARCH_TICKET_LIMIT = 100;

const normalizeStatusCategory = (key?: string): TicketStatusCategory => {
  const normalized = key?.trim().toLowerCase();

  if (normalized === "new" || normalized === "to-do" || normalized === "todo") {
    return "new";
  }

  if (normalized === "indeterminate" || normalized === "in-flight" || normalized === "inflight") {
    return "indeterminate";
  }

  if (normalized === "done" || normalized === "completed" || normalized === "complete") {
    return "done";
  }

  return "unknown";
};

const searchTickets = async (settings: AppSettings, jql: string, limit: number) => {
  if (limit <= 0) {
    return [];
  }

  const issues: JiraTicketIssue[] = [];
  let nextPageToken: string | undefined;
  let guard = 0;

  do {
    const remaining = limit - issues.length;
    const params = new URLSearchParams({
      jql,
      maxResults: String(Math.min(TICKET_PAGE_SIZE, remaining)),
      fields: TICKET_FIELDS
    });

    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }

    const page = await jiraRequest<JiraTicketSearchResponse>(settings, `/rest/api/3/search/jql?${params.toString()}`);
    issues.push(...(page.issues ?? []));
    nextPageToken = page.nextPageToken;
    guard += 1;

    if (page.isLast !== false || issues.length >= limit) {
      break;
    }
  } while (nextPageToken && guard < 50);

  return issues.slice(0, limit);
};

const toTicket = (settings: AppSettings, issue: JiraTicketIssue): JiraTicket => {
  const fields = issue.fields ?? {};
  const loggedSecondsTotal = fields.aggregatetimespent ?? fields.timetracking?.timeSpentSeconds ?? 0;

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary ?? "Untitled Jira issue",
    projectKey: fields.project?.key ?? issue.key.split("-")[0],
    projectName: fields.project?.name ?? fields.project?.key ?? "—",
    statusName: fields.status?.name ?? "Unknown",
    statusCategory: normalizeStatusCategory(fields.status?.statusCategory?.key),
    loggedSecondsTotal,
    createdAt: fields.created,
    updatedAt: fields.updated,
    assigneeDisplayName: fields.assignee?.displayName?.trim() || undefined,
    issueType: normalizeIssueType(fields.issuetype),
    epic: normalizeEpic(settings, fields.parent),
    url: `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${issue.key}`
  };
};

const fetchAllIssueWorklogs = async (settings: AppSettings, issueKey: string) => {
  const worklogs: JiraWorklogResponse["worklogs"] = [];
  let startAt = 0;
  let total = 0;
  let guard = 0;

  do {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: "100"
    });

    const page = await jiraRequest<JiraWorklogResponse>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?${params.toString()}`
    );

    worklogs.push(...(page.worklogs ?? []));
    total = page.total;
    startAt = page.startAt + page.maxResults;
    guard += 1;
  } while (startAt < total && guard < 50);

  return worklogs;
};

export const fetchJiraIssueDetails = async (request: IssueDetailsRequest): Promise<IssueDetailsResult> => {
  const { settings } = request;
  const issueKey = request.issueKey.trim().toUpperCase();

  if (!issueKey) {
    throw new JiraApiError("Choose a Jira issue first.");
  }

  const params = new URLSearchParams({
    fields: ISSUE_DETAILS_FIELDS
  });

  const [currentUser, issue] = await Promise.all([
    fetchCurrentUser(settings),
    jiraRequest<JiraTicketIssue>(settings, `/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`)
  ]);

  const [worklogs, issueComments] = await Promise.all([
    fetchAllIssueWorklogs(settings, issue.key),
    fetchRecentIssueComments(settings, issue.key, ISSUE_DETAILS_COMMENT_LIMIT).catch(
      () => []
    )
  ]);
  const myWorklogs = worklogs.filter((worklog) => worklog.author?.accountId === currentUser.accountId);
  const myLoggedSecondsTotal = myWorklogs.reduce((sum, worklog) => sum + worklog.timeSpentSeconds, 0);
  const comments = issueComments
    .map((comment) => adfToPlainText(comment.body).trim())
    .filter(Boolean)
    .slice(-ISSUE_DETAILS_COMMENT_LIMIT);
  const details: JiraIssueDetails = {
    ...toTicket(settings, issue),
    description: adfToPlainText(issue.fields?.description) || undefined,
    descriptionAdf: issue.fields?.description,
    comments,
    myLoggedSecondsTotal,
    myWorklogCount: myWorklogs.length
  };

  return details;
};

export const fetchAssignedTickets = async (request: TicketsRequest): Promise<TicketsResult> => {
  const { settings } = request;
  const currentUser = await fetchCurrentUser(settings);
  const assigneeClause = request.assignedOnly === false ? "" : "assignee = currentUser() AND ";

  const [openIssues, closedIssues] = await Promise.all([
    searchTickets(
      settings,
      `${assigneeClause}statusCategory != Done ORDER BY statusCategory DESC, updated DESC`,
      ASSIGNED_OPEN_TICKET_LIMIT
    ),
    searchTickets(
      settings,
      `${assigneeClause}statusCategory = Done AND resolved >= -14d ORDER BY resolved DESC`,
      RECENTLY_CLOSED_TICKET_LIMIT
    )
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    accountId: currentUser.accountId,
    inProgress: openIssues.map((issue) => toTicket(settings, issue)),
    recentlyClosed: closedIssues.map((issue) => toTicket(settings, issue))
  };
};

const escapeJqlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");

const normalizeTicketSearchQuery = (query: string) => query.trim().replace(/\s+/g, " ").slice(0, 160);

const issueKeyFromQuery = (query: string) => {
  const exactKey = query.match(/^[a-z][a-z0-9]+-\d+$/i)?.[0];
  if (exactKey) {
    return exactKey.toUpperCase();
  }

  return query.match(/\b[a-z][a-z0-9]+-\d+\b/i)?.[0]?.toUpperCase();
};

const clampTicketSearchLimit = (limit?: number) => {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_SEARCH_TICKET_LIMIT;
  }

  return Math.max(1, Math.min(Math.round(limit), MAX_SEARCH_TICKET_LIMIT));
};

const ticketSearchOrder = (sortMode?: TicketSortMode) => {
  if (sortMode === "createdAsc") {
    return "created ASC";
  }

  if (sortMode === "createdDesc") {
    return "created DESC";
  }

  return "created DESC";
};

export const searchJiraTickets = async (request: SearchTicketsRequest): Promise<SearchTicketsResult> => {
  const { settings } = request;
  const query = normalizeTicketSearchQuery(request.query);
  const canBrowseWithoutQuery = request.allowEmptyQuery === true && query.length === 0;

  if (query.length < 2 && !canBrowseWithoutQuery) {
    return { query, issues: [] };
  }

  const clauses: string[] = [];

  if (request.assignedOnly) {
    clauses.push("assignee = currentUser()");
  }

  if (query.length >= 2) {
    const textClauses = [`text ~ "${escapeJqlString(query)}"`];
    const issueKey = issueKeyFromQuery(query);

    if (issueKey) {
      textClauses.unshift(`issuekey = ${issueKey}`);
    }

    clauses.push(`(${Array.from(new Set(textClauses)).join(" OR ")})`);
  } else if (!request.assignedOnly) {
    clauses.push("created <= now()");
  }

  const jql = `${clauses.join(" AND ")} ORDER BY ${ticketSearchOrder(request.sortMode)}`;
  const issues = await searchTickets(settings, jql, clampTicketSearchLimit(request.limit));

  return {
    query,
    issues: issues.map((issue) => toTicket(settings, issue))
  };
};

const toJiraStarted = (startedISO: string) => {
  const date = new Date(startedISO);
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absOffset / 60))}${pad(absOffset % 60)}`;

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000${offset}`
  );
};

const plainTextToAdf = (text: string) => ({
  type: "doc",
  version: 1,
  content: text
    .split("\n")
    .map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : []
    }))
});

const validateWorklogDuration = (timeSpentSeconds: number) => {
  if (!Number.isFinite(timeSpentSeconds) || timeSpentSeconds <= 0) {
    throw new JiraApiError("Worklog duration must be greater than zero.");
  }
};

const buildWorklogBody = (
  timeSpentSeconds: number,
  startedISO: string,
  comment: string | undefined,
  options: { includeEmptyComment: boolean }
) => {
  validateWorklogDuration(timeSpentSeconds);

  const body: Record<string, unknown> = {
    timeSpentSeconds: Math.round(timeSpentSeconds),
    started: toJiraStarted(startedISO)
  };

  const trimmedComment = comment?.trim();
  if (trimmedComment || options.includeEmptyComment) {
    body.comment = plainTextToAdf(trimmedComment ?? "");
  }

  return body;
};

export const addWorklog = async (request: AddWorklogRequest): Promise<AddWorklogResult> => {
  const { settings, issueKey, timeSpentSeconds, startedISO, comment } = request;
  const body = buildWorklogBody(timeSpentSeconds, startedISO, comment, { includeEmptyComment: false });

  const created = await jiraRequest<{ id: string }>(
    settings,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return {
    ok: true,
    worklogId: created.id,
    issueKey,
    timeSpentSeconds: Math.round(timeSpentSeconds)
  };
};

export const updateWorklog = async (request: UpdateWorklogRequest): Promise<UpdateWorklogResult> => {
  const { settings, issueKey, worklogId, timeSpentSeconds, startedISO, comment } = request;
  const body = buildWorklogBody(timeSpentSeconds, startedISO, comment, { includeEmptyComment: true });

  const updated = await jiraRequest<{ id?: string; timeSpentSeconds?: number }>(
    settings,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return {
    ok: true,
    worklogId: updated.id ?? worklogId,
    issueKey,
    timeSpentSeconds: updated.timeSpentSeconds ?? Math.round(timeSpentSeconds)
  };
};

export const deleteWorklog = async (request: DeleteWorklogRequest): Promise<DeleteWorklogResult> => {
  const { settings, issueKey, worklogId } = request;

  await jiraRequest<void>(
    settings,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    { method: "DELETE" }
  );

  return {
    ok: true,
    worklogId,
    issueKey
  };
};

export const moveWorklog = async (request: MoveWorklogRequest): Promise<MoveWorklogResult> => {
  const { settings, sourceIssueKey, targetIssueKey, worklogId, adjustEstimate } = request;
  const numericWorklogId = Number(worklogId);

  if (!Number.isSafeInteger(numericWorklogId) || numericWorklogId <= 0) {
    throw new JiraApiError("Jira worklog ID is invalid.");
  }

  if (!sourceIssueKey.trim() || !targetIssueKey.trim() || sourceIssueKey === targetIssueKey) {
    throw new JiraApiError("Choose a different Jira issue for the worklog move.");
  }

  const params = new URLSearchParams({ adjustEstimate });

  try {
    const response = await jiraFetch(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(sourceIssueKey)}/worklog/move?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [numericWorklogId], issueIdOrKey: targetIssueKey })
      }
    );

    if (response.status !== 204) {
      const detail = (await response.text()).trim();
      throw new JiraApiError(
        `Jira only partially completed the worklog move${detail ? `: ${detail}` : "."}`,
        response.status
      );
    }
  } catch (error) {
    if (error instanceof JiraApiError && (error.status === 400 || error.status === 403)) {
      throw new JiraApiError(
        `${error.message} Jira's move operation requires Work on issues and Delete all worklogs permissions.`,
        error.status
      );
    }
    throw error;
  }

  return {
    ok: true,
    worklogId,
    sourceIssueKey,
    targetIssueKey,
    adjustEstimate
  };
};
