import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  JiraConnectionResult,
  JiraEpicInfo,
  JiraIssueSummary,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
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
    aggregatetimespent?: number | null;
    timetracking?: { timeSpentSeconds?: number };
    project?: { key?: string; name?: string };
    status?: { name?: string; statusCategory?: { key?: string } };
    issuetype?: JiraIssueTypeResponse;
    parent?: JiraParentResponse;
    created?: string;
    assignee?: { displayName?: string } | null;
  };
}

interface JiraTicketSearchResponse {
  issues?: JiraTicketIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

interface JiraWorklogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  worklogs?: Array<{
    id: string;
    author?: {
      accountId?: string;
      displayName?: string;
    };
    started: string;
    timeSpentSeconds: number;
    comment?: unknown;
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

const jiraRequest = async <T>(settings: AppSettings, path: string, init: RequestInit = {}) => {
  ensureSettings(settings);
  const baseUrl = normalizeBaseUrl(settings.jiraBaseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(settings),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await parseJiraError(response);

    if (response.status === 401 || response.status === 403) {
      throw new JiraApiError(`Jira rejected the credentials or permissions: ${message}`, response.status);
    }

    throw new JiraApiError(`Jira request failed: ${message}`, response.status);
  }

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
      fields: "summary,issuetype,parent"
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

  return issues;
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
  } while (startAt < total);

  return worklogs;
};

export const syncJiraWorklogs = async (request: SyncRequest): Promise<SyncResult> => {
  const { settings, weekStartISO, weekEndExclusiveISO, weekKey } = request;
  const weekStart = new Date(weekStartISO);
  const weekEndExclusive = new Date(weekEndExclusiveISO);
  const currentUser = await fetchCurrentUser(settings);
  const candidateIssues = await searchCandidateIssues(settings, weekStart, weekEndExclusive);
  const daySummaries: SyncResult["daySummaries"] = {};
  const collectedWorklogs: JiraWorklog[] = [];

  for (const issue of candidateIssues) {
    const summary = issue.fields?.summary ?? "Untitled Jira issue";
    const issueType = normalizeIssueType(issue.fields?.issuetype);
    const epic = normalizeEpic(settings, issue.fields?.parent);
    const worklogs = await fetchIssueWorklogs(settings, issue.key, weekStart, weekEndExclusive);

    for (const worklog of worklogs) {
      const authorAccountId = worklog.author?.accountId;
      const startedDate = new Date(worklog.started);

      if (
        authorAccountId !== currentUser.accountId ||
        Number.isNaN(startedDate.getTime()) ||
        startedDate < weekStart ||
        startedDate >= weekEndExclusive
      ) {
        continue;
      }

      const dateKey = toDateKey(startedDate);
      const comment = adfToPlainText(worklog.comment);
      const issueUrl = `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${issue.key}`;
      const normalized: JiraWorklog = {
        id: worklog.id,
        issueId: issue.id,
        issueKey: issue.key,
        issueSummary: summary,
        issueUrl,
        issueType,
        epic,
        authorAccountId,
        started: worklog.started,
        timeSpentSeconds: worklog.timeSpentSeconds,
        comment: comment || undefined
      };

      if (!daySummaries[dateKey]) {
        daySummaries[dateKey] = {
          trackedSeconds: 0,
          issues: [],
          worklogs: []
        };
      }

      const bucket = daySummaries[dateKey];
      bucket.trackedSeconds += worklog.timeSpentSeconds;
      bucket.worklogs.push(normalized);
      mergeIssue(bucket, {
        id: issue.id,
        key: issue.key,
        summary,
        url: issueUrl,
        issueType,
        epic,
        loggedSeconds: worklog.timeSpentSeconds,
        comments: comment ? [comment] : []
      });
      collectedWorklogs.push(normalized);
    }
  }

  const trackedSeconds = collectedWorklogs.reduce((sum, worklog) => sum + worklog.timeSpentSeconds, 0);

  return {
    weekKey,
    weekStartISO,
    weekEndExclusiveISO,
    syncedAt: new Date().toISOString(),
    accountId: currentUser.accountId,
    displayName: currentUser.displayName,
    trackedSeconds,
    issueCount: candidateIssues.length,
    worklogCount: collectedWorklogs.length,
    daySummaries
  };
};

const TICKET_FIELDS = "summary,status,project,timetracking,aggregatetimespent,issuetype,parent,created,assignee";
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
    assigneeDisplayName: fields.assignee?.displayName?.trim() || undefined,
    issueType: normalizeIssueType(fields.issuetype),
    epic: normalizeEpic(settings, fields.parent),
    url: `${normalizeBaseUrl(settings.jiraBaseUrl)}/browse/${issue.key}`
  };
};

export const fetchAssignedTickets = async (request: TicketsRequest): Promise<TicketsResult> => {
  const { settings } = request;
  const currentUser = await fetchCurrentUser(settings);

  const [openIssues, closedIssues] = await Promise.all([
    searchTickets(
      settings,
      "assignee = currentUser() AND statusCategory != Done ORDER BY statusCategory DESC, updated DESC",
      ASSIGNED_OPEN_TICKET_LIMIT
    ),
    searchTickets(
      settings,
      "assignee = currentUser() AND statusCategory = Done AND resolved >= -14d ORDER BY resolved DESC",
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
