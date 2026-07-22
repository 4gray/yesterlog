import type {
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  PersonalNote,
  RecapColorToken,
  RecapCopyLine,
  RecapCopyParagraph,
  RecapCoverage,
  RecapDetail,
  RecapDraftRecord,
  RecapDraftVersion,
  RecapFormat,
  RecapFormatCopy,
  RecapInterval,
  RecapPeriod,
  RecapSourceItem,
  RecapTheme,
  RecurringEntry,
  SyncResult,
  WeekdayNumber
} from "../../shared/types";
import {
  buildReconstructDay,
  toReconstructCommitGroups,
  toReconstructJiraActivities,
  toReconstructReviewSessions,
  type ReconstructLocalEntry,
  type ReconstructWorklog
} from "./reconstruct";
import { getWorklogDisplaySeconds, getWorklogDisplayStarted } from "./worklogAllocation";
import {
  addDays,
  fromLocalDateKey,
  getIsoWeekNumber,
  startOfWeekMonday,
  toLocalDateKey
} from "../utils/date";

const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const DAY_SHORT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const COLORS: RecapColorToken[] = ["blue", "purple", "teal", "amber", "coral"];
export const RECAP_SCHEMA_VERSION = 3;

export const recapRecordHasCurrentSchema = (record: RecapDraftRecord | undefined) =>
  Boolean(record?.versions.some((version) => version.schemaVersion === RECAP_SCHEMA_VERSION));

export interface RecapReconstructDraft {
  placements: Record<string, number>;
  durations: Record<string, number>;
}

export interface RecapEvidenceInput {
  interval: RecapInterval;
  syncResults: SyncResult[];
  reviewResults: BitbucketReviewSyncResult[];
  activityResults: JiraActivitySyncResult[];
  personalNotes: PersonalNote[];
  recurringEntries: RecurringEntry[];
  reconstructDrafts: Record<string, RecapReconstructDraft | undefined>;
}

const keyFor = (period: RecapPeriod, date: Date) => {
  if (period === "week") return `week:${toLocalDateKey(startOfWeekMonday(date))}`;
  if (period === "month") return `month:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `quarter:${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
};

export const recapIntervalForDate = (period: RecapPeriod, input: Date): RecapInterval => {
  const date = new Date(input.getFullYear(), input.getMonth(), input.getDate());
  if (period === "week") {
    const start = startOfWeekMonday(date);
    const end = addDays(start, 7);
    const label = `${DAY_SHORT.format(start)}-${DAY_SHORT.format(addDays(end, -1))} · Week ${getIsoWeekNumber(start)}`;
    return {
      key: keyFor(period, start),
      period,
      startDateKey: toLocalDateKey(start),
      endDateKeyExclusive: toLocalDateKey(end),
      label,
      shortLabel: `Wk ${getIsoWeekNumber(start)}`,
      calendarLabel: `Week ${getIsoWeekNumber(start)}`
    };
  }
  if (period === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return {
      key: keyFor(period, start),
      period,
      startDateKey: toLocalDateKey(start),
      endDateKeyExclusive: toLocalDateKey(end),
      label: MONTH_LONG.format(start),
      shortLabel: MONTH_SHORT.format(start),
      calendarLabel: new Intl.DateTimeFormat(undefined, { month: "long" }).format(start)
    };
  }
  const q = Math.floor(date.getMonth() / 3) + 1;
  const start = new Date(date.getFullYear(), (q - 1) * 3, 1);
  const end = new Date(date.getFullYear(), q * 3, 1);
  const months = `${new Intl.DateTimeFormat(undefined, { month: "short" }).format(start)}-${new Intl.DateTimeFormat(undefined, { month: "short" }).format(addDays(end, -1))}`;
  return {
    key: keyFor(period, start),
    period,
    startDateKey: toLocalDateKey(start),
    endDateKeyExclusive: toLocalDateKey(end),
    label: `Q${q} ${start.getFullYear()} · ${months}`,
    shortLabel: `Q${q} ${start.getFullYear()}`,
    calendarLabel: `Q${q}`
  };
};

export const shiftRecapInterval = (interval: RecapInterval, amount: number): RecapInterval => {
  const start = fromLocalDateKey(interval.startDateKey);
  if (interval.period === "week") return recapIntervalForDate("week", addDays(start, amount * 7));
  if (interval.period === "month") return recapIntervalForDate("month", new Date(start.getFullYear(), start.getMonth() + amount, 1));
  return recapIntervalForDate("quarter", new Date(start.getFullYear(), start.getMonth() + amount * 3, 1));
};

export const recapIntervalFromKey = (period: RecapPeriod, value: string, fallback: Date): RecapInterval => {
  if (period === "week" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return recapIntervalForDate(period, fromLocalDateKey(value));
  if (period === "month" && /^\d{4}-\d{2}$/.test(value)) return recapIntervalForDate(period, fromLocalDateKey(`${value}-01`));
  const q = /^(\d{4})-Q([1-4])$/.exec(value);
  if (period === "quarter" && q) return recapIntervalForDate(period, new Date(Number(q[1]), (Number(q[2]) - 1) * 3, 1));
  return recapIntervalForDate(period, fallback);
};

export const recapIntervalParam = (interval: RecapInterval) => interval.key.replace(/^[^:]+:/, "");

export const recapWeekKeys = (interval: RecapInterval): string[] => {
  const keys: string[] = [];
  let cursor = startOfWeekMonday(fromLocalDateKey(interval.startDateKey));
  const end = fromLocalDateKey(interval.endDateKeyExclusive);
  while (cursor < end) {
    keys.push(toLocalDateKey(cursor));
    cursor = addDays(cursor, 7);
  }
  return keys;
};

const inInterval = (dateKey: string, interval: RecapInterval) =>
  dateKey >= interval.startDateKey && dateKey < interval.endDateKeyExclusive;

const addSource = (map: Map<string, RecapSourceItem>, source: RecapSourceItem) => {
  const existing = map.get(source.id);
  if (existing) {
    const details = Array.from(new Set([
      ...(existing.details ?? (existing.detail ? [existing.detail] : [])),
      ...(source.details ?? (source.detail ? [source.detail] : []))
    ].map((value) => value.trim()).filter(Boolean)));
    const dateKeys = Array.from(new Set([
      ...(existing.dateKeys ?? [existing.dateKey]),
      ...(source.dateKeys ?? [source.dateKey])
    ])).sort();
    map.set(source.id, {
      ...existing,
      epicKey: existing.epicKey ?? source.epicKey,
      epicSummary: existing.epicSummary ?? source.epicSummary,
      projectKey: existing.projectKey ?? source.projectKey,
      projectName: existing.projectName ?? source.projectName,
      components: Array.from(new Set([...(existing.components ?? []), ...(source.components ?? [])])),
      repository: existing.repository ?? source.repository,
      detail: details[0],
      details,
      dateKeys,
      timeSpentSeconds: existing.timeSpentSeconds + source.timeSpentSeconds
    });
  } else {
    map.set(source.id, {
      ...source,
      details: source.details ?? (source.detail ? [source.detail] : []),
      dateKeys: source.dateKeys ?? [source.dateKey]
    });
  }
};

const reconstructedSignalSeconds = (input: RecapEvidenceInput) => {
  const durations = new Map<string, number>();
  let cursor = fromLocalDateKey(input.interval.startDateKey);
  const end = fromLocalDateKey(input.interval.endDateKeyExclusive);
  while (cursor < end) {
    const dateKey = toLocalDateKey(cursor);
    const worklogs = input.syncResults.flatMap((result) => result.daySummaries[dateKey]?.worklogs ?? []);
    const localEntries: ReconstructLocalEntry[] = [
      ...input.personalNotes.filter((note) => note.dateKey === dateKey).map((note) => ({
        id: note.id,
        source: "personal-note" as const,
        title: note.title?.trim() || note.text.trim() || "Private note",
        startedISO: note.startedISO,
        timeSpentSeconds: note.timeSpentSeconds,
        note: note.text
      })),
      ...input.recurringEntries.filter((entry) => entry.dateKey === dateKey).map((entry) => ({
        id: `recurring:${entry.eventId}:${entry.dateKey}`,
        source: "recurring" as const,
        title: entry.title,
        startedISO: `${entry.dateKey}T${entry.localTime}:00`,
        timeSpentSeconds: entry.timeSpentSeconds,
        note: entry.note
      }))
    ];
    const reconstructWorklogs: ReconstructWorklog[] = worklogs.map((worklog) => ({
      issueKey: worklog.issueKey,
      issueSummary: worklog.issueSummary,
      startedISO: getWorklogDisplayStarted(worklog),
      timeSpentSeconds: getWorklogDisplaySeconds(worklog),
      comment: worklog.comment
    }));
    const saved = input.reconstructDrafts[dateKey];
    const day = buildReconstructDay({
      dateKey,
      weekdayIso: ((cursor.getDay() + 6) % 7 + 1) as WeekdayNumber,
      isToday: false,
      workingDays: [1, 2, 3, 4, 5],
      targetMinutes: 8 * 60,
      worklogs: reconstructWorklogs,
      localEntries,
      reviewSessions: input.reviewResults.flatMap((result) => toReconstructReviewSessions(result.sessions, dateKey)),
      commits: input.reviewResults.flatMap((result) => toReconstructCommitGroups(result.commitGroups, dateKey)),
      jiraActivities: input.activityResults.flatMap((result) => toReconstructJiraActivities(result.activities, dateKey))
    }, saved?.placements, saved?.durations);
    for (const row of day.rows) {
      if (row.kind === "filled" && row.signalId) {
        durations.set(row.signalId, (durations.get(row.signalId) ?? 0) + row.durationMinutes * 60);
      }
    }
    cursor = addDays(cursor, 1);
  }
  return durations;
};

interface RecapIssueContext {
  epicKey?: string;
  epicSummary?: string;
  projectKey?: string;
  projectName?: string;
  components?: string[];
}

const issueProjectKey = (issueKey?: string) => issueKey?.split("-")[0];

const mergeIssueContext = (current: RecapIssueContext | undefined, next: RecapIssueContext): RecapIssueContext => ({
  epicKey: current?.epicKey ?? next.epicKey,
  epicSummary: current?.epicSummary ?? next.epicSummary,
  projectKey: current?.projectKey ?? next.projectKey,
  projectName: current?.projectName ?? next.projectName,
  components: Array.from(new Set([...(current?.components ?? []), ...(next.components ?? [])]))
});

const sourceClusterKey = (context: RecapIssueContext, repository?: string, issueKey?: string) => {
  if (context.epicKey) return `epic:${context.epicKey}`;
  if (context.components?.[0]) return `component:${context.projectKey ?? issueProjectKey(issueKey) ?? "jira"}:${context.components[0]}`;
  if (context.projectKey || issueKey) return `project:${context.projectKey ?? issueProjectKey(issueKey)}`;
  if (repository) return `repo:${repository}`;
  return issueKey ? `ticket:${issueKey}` : "local:operations";
};

export const buildRecapSources = (input: RecapEvidenceInput): RecapSourceItem[] => {
  const sources = new Map<string, RecapSourceItem>();
  const signalSeconds = reconstructedSignalSeconds(input);
  const issueContexts = new Map<string, RecapIssueContext>();
  for (const result of input.syncResults) {
    for (const day of Object.values(result.daySummaries)) {
      for (const worklog of day.worklogs) {
        issueContexts.set(worklog.issueKey, mergeIssueContext(issueContexts.get(worklog.issueKey), {
          epicKey: worklog.epic?.key,
          epicSummary: worklog.epic?.summary,
          projectKey: worklog.projectKey ?? issueProjectKey(worklog.issueKey),
          projectName: worklog.projectName,
          components: worklog.components
        }));
      }
    }
  }
  for (const result of input.activityResults) {
    for (const activity of result.activities) {
      issueContexts.set(activity.issueKey, mergeIssueContext(issueContexts.get(activity.issueKey), {
        epicKey: activity.epic?.key,
        epicSummary: activity.epic?.summary,
        projectKey: activity.projectKey ?? issueProjectKey(activity.issueKey),
        projectName: activity.projectName,
        components: activity.components
      }));
    }
  }
  for (const result of input.syncResults) {
    for (const [dateKey, day] of Object.entries(result.daySummaries)) {
      if (!inInterval(dateKey, input.interval)) continue;
      for (const worklog of day.worklogs) {
        const context = issueContexts.get(worklog.issueKey) ?? {
          epicKey: worklog.epic?.key,
          epicSummary: worklog.epic?.summary,
          projectKey: worklog.projectKey ?? issueProjectKey(worklog.issueKey),
          projectName: worklog.projectName,
          components: worklog.components
        };
        addSource(sources, {
          id: `ticket:${worklog.issueKey}`,
          kind: "ticket",
          dateKey,
          title: worklog.issueSummary || worklog.issueKey,
          timeSpentSeconds: getWorklogDisplaySeconds(worklog),
          issueKey: worklog.issueKey,
          issueUrl: worklog.issueUrl,
          ...context,
          detail: worklog.comment,
          clusterKey: sourceClusterKey(context, undefined, worklog.issueKey)
        });
      }
    }
  }
  for (const result of input.reviewResults) {
    for (const session of result.sessions) {
      if (!inInterval(session.dateKey, input.interval) || session.status === "logged") continue;
      const seconds = signalSeconds.get(session.id) ?? 0;
      if (!seconds) continue;
      const context = (session.jiraIssueKey ? issueContexts.get(session.jiraIssueKey) : undefined) ?? {
        projectKey: issueProjectKey(session.jiraIssueKey)
      };
      addSource(sources, {
        id: `pr:${session.workspace}:${session.repositorySlug}:${session.pullRequestId}`,
        kind: "pull-request",
        dateKey: session.dateKey,
        title: session.pullRequestTitle,
        timeSpentSeconds: seconds,
        issueKey: session.jiraIssueKey,
        ...context,
        repository: session.repositoryName,
        pullRequestId: session.pullRequestId,
        pullRequestUrl: session.pullRequestUrl,
        role: session.isPullRequestAuthor ? "authored" : "reviewed",
        clusterKey: sourceClusterKey(context, session.repositoryName, session.jiraIssueKey)
      });
    }
    for (const group of result.commitGroups ?? []) {
      if (!inInterval(group.dateKey, input.interval)) continue;
      const seconds = signalSeconds.get(group.id) ?? 0;
      if (!seconds) continue;
      const context = issueContexts.get(group.jiraIssueKey ?? "") ?? {
        projectKey: issueProjectKey(group.jiraIssueKey)
      };
      addSource(sources, {
        id: `commit:${group.id}`,
        kind: "commit",
        dateKey: group.dateKey,
        title: group.primaryMessage,
        timeSpentSeconds: seconds,
        issueKey: group.jiraIssueKey,
        ...context,
        repository: group.repositoryName,
        pullRequestId: group.pullRequestId,
        detail: `${group.commitCount} ${group.commitCount === 1 ? "commit" : "commits"}`,
        clusterKey: sourceClusterKey(context, group.repositoryName, group.jiraIssueKey)
      });
    }
  }
  for (const result of input.activityResults) {
    for (const activity of result.activities) {
      if (!inInterval(activity.dateKey, input.interval)) continue;
      const seconds = signalSeconds.get(activity.id) ?? 0;
      if (!seconds) continue;
      const context = issueContexts.get(activity.issueKey) ?? {
        epicKey: activity.epic?.key,
        epicSummary: activity.epic?.summary,
        projectKey: activity.projectKey ?? issueProjectKey(activity.issueKey),
        projectName: activity.projectName,
        components: activity.components
      };
      addSource(sources, {
        id: `activity:${activity.id}`,
        kind: "ticket",
        dateKey: activity.dateKey,
        title: activity.title || activity.issueSummary,
        timeSpentSeconds: seconds,
        issueKey: activity.issueKey,
        issueUrl: activity.issueUrl,
        ...context,
        detail: activity.description,
        clusterKey: sourceClusterKey(context, undefined, activity.issueKey)
      });
    }
  }
  for (const note of input.personalNotes) {
    if (!inInterval(note.dateKey, input.interval)) continue;
    addSource(sources, {
      id: `note:${note.id}`,
      kind: note.category === "meeting" ? "meeting" : "local",
      dateKey: note.dateKey,
      title: note.title?.trim() || note.text.trim() || "Local work",
      timeSpentSeconds: note.timeSpentSeconds,
      detail: note.text,
      clusterKey: note.category === "meeting" ? "local:meetings" : "local:operations"
    });
  }
  for (const entry of input.recurringEntries) {
    if (!inInterval(entry.dateKey, input.interval)) continue;
    addSource(sources, {
      id: `recurring:${entry.eventId}:${entry.dateKey}`,
      kind: "meeting",
      dateKey: entry.dateKey,
      title: entry.title,
      timeSpentSeconds: entry.timeSpentSeconds,
      detail: entry.note,
      clusterKey: "local:meetings"
    });
  }
  return [...sources.values()].sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds || a.title.localeCompare(b.title));
};

export const recapSourceRef = (source: RecapSourceItem) =>
  source.issueKey || (source.pullRequestId ? `${source.repository ?? source.id}#${source.pullRequestId}` : source.id);

const sourceIdsForLine = (draft: RecapDraftVersion, theme: RecapTheme, line: RecapCopyLine) => {
  const refs = new Set(line.refs);
  const matched = draft.sources
    .filter((source) => theme.sourceIds.includes(source.id) && refs.has(recapSourceRef(source)))
    .map((source) => source.id);
  return matched.length || theme.copy.cv.lines.length !== 1 ? matched : theme.sourceIds;
};

export const carryRecapUserImpacts = (current: RecapDraftVersion | undefined, next: RecapDraftVersion): RecapDraftVersion => {
  if (!current) return next;
  const impacts = current.themes.flatMap((theme) => theme.copy.cv.lines
    .filter((line) => line.userImpact?.trim())
    .map((line) => ({ line, sourceIds: sourceIdsForLine(current, theme, line) })));
  if (!impacts.length) return next;
  const targets = next.themes.flatMap((theme, themeIndex) => theme.copy.cv.lines.map((line, lineIndex) => ({
    themeIndex,
    lineIndex,
    line,
    sourceIds: sourceIdsForLine(next, theme, line)
  })));
  const matches = impacts.flatMap((impact, impactIndex) => targets.flatMap((target, targetIndex) => {
    const overlap = impact.sourceIds.filter((id) => target.sourceIds.includes(id)).length;
    if (!overlap) return [];
    const exactSources = impact.sourceIds.length === target.sourceIds.length
      && impact.sourceIds.every((id) => target.sourceIds.includes(id));
    const score = (impact.line.id === target.line.id ? 1_000_000 : 0) + (exactSources ? 10_000 : 0) + overlap;
    return [{ impactIndex, targetIndex, score }];
  })).sort((a, b) => b.score - a.score || a.targetIndex - b.targetIndex || a.impactIndex - b.impactIndex);
  const assignedImpacts = new Set<number>();
  const assignedTargets = new Set<number>();
  const impactByTarget = new Map<string, string>();
  for (const match of matches) {
    if (assignedImpacts.has(match.impactIndex) || assignedTargets.has(match.targetIndex)) continue;
    assignedImpacts.add(match.impactIndex);
    assignedTargets.add(match.targetIndex);
    const target = targets[match.targetIndex];
    impactByTarget.set(`${target.themeIndex}:${target.lineIndex}`, impacts[match.impactIndex].line.userImpact!);
  }
  return {
    ...next,
    themes: next.themes.map((theme, themeIndex) => ({
      ...theme,
      copy: {
        ...theme.copy,
        cv: {
          ...theme.copy.cv,
          lines: theme.copy.cv.lines.map((line, lineIndex) => {
            const userImpact = impactByTarget.get(`${themeIndex}:${lineIndex}`);
            return userImpact ? { ...line, needsImpact: false, userImpact } : line;
          })
        }
      }
    }))
  };
};

const formatSourceDuration = (seconds: number) => {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const cleanFragment = (value: string) => value.trim().replace(/[—–]/g, " - ").replace(/\s+/g, " ").replace(/[.!?]+$/, "");

const cvScopeTitle = (value: string) => {
  const scope = cleanFragment(value).replace(
    /^(add|build|create|draft|fix|implement|investigate|move|polish|refactor|rework|review|support|tighten|update)\s+/i,
    ""
  );
  if (!scope) return cleanFragment(value);
  if (/^(Add Time|API|Bitbucket|Jira|Ops|Slack|TimeBro|UI|UX)\b/.test(scope)) return scope;
  return `${scope[0].toLowerCase()}${scope.slice(1)}`;
};

const humanList = (values: string[]) => {
  const items = Array.from(new Set(values.map(cleanFragment).filter(Boolean)));
  if (items.length <= 1) return items[0] ?? "recorded work";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

const refsFor = (sources: RecapSourceItem[]) => Array.from(new Set(sources.map(recapSourceRef)));

const lineForSource = (source: RecapSourceItem): RecapCopyLine => {
  const details = source.details ?? (source.detail ? [source.detail] : []);
  const long = details.length
    ? `${source.title}. ${details.slice(0, 2).map(cleanFragment).join("; ")}.`
    : `${source.title} (${formatSourceDuration(source.timeSpentSeconds)} recorded).`;
  return {
    id: `line:${source.id}`,
    short: `${cleanFragment(source.title)}.`,
    long,
    refs: [recapSourceRef(source)],
    emphasis: formatSourceDuration(source.timeSpentSeconds)
  };
};

const inferChangeTag = (source: RecapSourceItem): RecapCopyLine["tag"] => {
  const text = `${source.title} ${(source.details ?? []).join(" ")}`.toLowerCase();
  if (/\b(fixed|repaired|resolved|corrected)\b/.test(text)) return "Fixed";
  if (/\b(added|created|introduced|implemented)\b/.test(text)) return "Added";
  if (/\b(changed|updated|refactored|adjusted|replaced|moved)\b/.test(text)) return "Changed";
  return undefined;
};

const narrativeParagraphs = (name: string, sources: RecapSourceItem[], format: "perf" | "manager"): RecapCopyParagraph[] => {
  const total = formatSourceDuration(sources.reduce((sum, source) => sum + source.timeSpentSeconds, 0));
  const titles = sources.slice(0, 4).map((source) => source.title);
  const details = Array.from(new Set(sources.flatMap((source) => source.details ?? (source.detail ? [source.detail] : []))))
    .filter(Boolean)
    .slice(0, 4);
  const refs = refsFor(sources);
  const metrics = [
    new Set(sources.map((source) => source.issueKey).filter(Boolean)).size
      ? `${new Set(sources.map((source) => source.issueKey).filter(Boolean)).size} Jira ${new Set(sources.map((source) => source.issueKey).filter(Boolean)).size === 1 ? "item" : "items"}`
      : "",
    new Set(sources.filter((source) => source.pullRequestId).map((source) => `${source.repository}:${source.pullRequestId}`)).size
      ? `${new Set(sources.filter((source) => source.pullRequestId).map((source) => `${source.repository}:${source.pullRequestId}`)).size} pull ${new Set(sources.filter((source) => source.pullRequestId).map((source) => `${source.repository}:${source.pullRequestId}`)).size === 1 ? "request" : "requests"}`
      : ""
  ].filter(Boolean);
  const overview = format === "manager"
    ? `I spent ${total} on ${name}. The available history connects that work to ${humanList(titles)}${metrics.length ? ` across ${humanList(metrics)}` : ""}.`
    : `Work on ${name} accounts for ${total} in the available history. The recorded scope includes ${humanList(titles)}${metrics.length ? ` across ${humanList(metrics)}` : ""}.`;
  const paragraphs: RecapCopyParagraph[] = [{ id: `paragraph:${format}:overview`, text: overview, refs }];
  if (details.length) {
    const quotedDetails = details.map((value) => `“${cleanFragment(value)}”`).join("; ");
    paragraphs.push({
      id: `paragraph:${format}:details`,
      text: format === "manager"
        ? `My recorded notes include ${quotedDetails}. They describe observed activity rather than inferred business outcomes.`
        : `The supporting notes include ${quotedDetails}. They establish the work performed, but do not claim an outcome that was not captured.`,
      refs
    });
  }
  return paragraphs;
};

const formatCopy = (name: string, sources: RecapSourceItem[], format: RecapFormat): RecapFormatCopy => {
  const base = sources.map(lineForSource);
  if (format === "cv") {
    const reviewedOnly = sources.every((source) => source.kind === "pull-request" && source.role === "reviewed");
    const collaborationOnly = sources.every((source) => source.kind === "meeting" || source.kind === "local");
    const verb = reviewedOnly ? "Reviewed" : collaborationOnly ? "Supported" : "Contributed to";
    const distinctTitles = sources
      .map((source) => cvScopeTitle(source.title))
      .filter((title) => cleanFragment(title).toLowerCase() !== cleanFragment(name).toLowerCase())
      .slice(0, 3);
    const scope = distinctTitles.length ? `, with work spanning ${humanList(distinctTitles)}` : "";
    const candidate = `${verb} ${name}${scope}.`;
    return { lines: [{
      id: `line:cv:${sources.map((source) => source.id).join("|")}`,
      short: candidate,
      long: candidate,
      refs: refsFor(sources),
      needsImpact: true
    }] };
  }
  if (format === "standup") {
    return { lead: `Work recorded for ${name}.`, lines: base.map((line, index) => ({ ...line, id: `${line.id}:standup:${index}` })) };
  }
  if (format === "changelog") {
    return { version: `Available changes for ${name}`, lines: sources.map((source, index) => ({
      ...lineForSource(source),
      id: `line:changelog:${source.id}:${index}`,
      tag: inferChangeTag(source)
    })) };
  }
  if (format === "manager") {
    return { lead: `I focused on ${name}.`, paragraphs: narrativeParagraphs(name, sources, "manager"), lines: base };
  }
  return { lead: `Focus area: ${name}`, paragraphs: narrativeParagraphs(name, sources, "perf"), lines: base };
};

const clusterName = (sources: RecapSourceItem[]) => {
  const first = sources[0];
  if (first.epicSummary) return first.epicSummary;
  if (first.epicKey) return first.epicKey;
  if (first.components?.[0]) return first.projectName ? `${first.projectName} / ${first.components[0]}` : first.components[0];
  if (first.projectName) return first.projectName;
  if (first.clusterKey === "local:meetings") return "Meetings & collaboration";
  if (first.clusterKey === "local:operations") return "Operations & support";
  if (first.repository) return first.repository;
  if (first.projectKey) return first.projectKey;
  return first.title;
};

export const buildRecapThemes = (sources: RecapSourceItem[], period: RecapPeriod): RecapTheme[] => {
  const grouped = new Map<string, RecapSourceItem[]>();
  for (const source of sources) grouped.set(source.clusterKey, [...(grouped.get(source.clusterKey) ?? []), source]);
  const clusters = [...grouped.values()].sort(
    (a, b) => b.reduce((sum, item) => sum + item.timeSpentSeconds, 0) - a.reduce((sum, item) => sum + item.timeSpentSeconds, 0)
  );
  const limit = period === "week" ? 4 : period === "month" ? 6 : 8;
  const selected = clusters.slice(0, limit);
  if (clusters.length > limit) selected[limit - 1] = selected[limit - 1].concat(...clusters.slice(limit));
  return selected.map((items, index) => {
    const name = clusters.length > limit && index === limit - 1 ? "Additional contributions" : clusterName(items);
    const formats = ["perf", "manager", "cv", "standup", "changelog"] as RecapFormat[];
    return {
      id: `theme:${index}:${items.map((item) => item.id).join("|")}`,
      name,
      colorToken: COLORS[index % COLORS.length],
      hours: items.reduce((sum, item) => sum + item.timeSpentSeconds, 0) / 3600,
      pullRequestCount: new Set(items.filter((item) => item.pullRequestId).map((item) => `${item.repository}:${item.pullRequestId}`)).size,
      ticketCount: new Set(items.map((item) => item.issueKey).filter(Boolean)).size,
      sourceIds: items.map((item) => item.id),
      copy: Object.fromEntries(formats.map((format) => [format, formatCopy(name, items, format)])) as Record<RecapFormat, RecapFormatCopy>
    };
  });
};

export const buildRecapCoverage = (input: RecapEvidenceInput, sources: RecapSourceItem[], now = new Date()): RecapCoverage => {
  const requestedWeekKeys = recapWeekKeys(input.interval);
  const requested = new Set(requestedWeekKeys);
  const currentWeekKey = toLocalDateKey(startOfWeekMonday(now));
  const elapsedWeekKeys = requestedWeekKeys.filter((weekKey) => weekKey <= currentWeekKey);
  const intervalStart = fromLocalDateKey(input.interval.startDateKey);
  const intervalEnd = fromLocalDateKey(input.interval.endDateKeyExclusive);
  const jiraWeeks = elapsedWeekKeys.filter((weekKey) => {
    const weekStart = fromLocalDateKey(weekKey);
    const coveredStart = weekStart > intervalStart ? weekStart : intervalStart;
    const weekEnd = addDays(weekStart, 7);
    const intervalBoundedEnd = weekEnd < intervalEnd ? weekEnd : intervalEnd;
    const coveredEnd = intervalBoundedEnd < now ? intervalBoundedEnd : now;
    if (coveredEnd <= coveredStart) return false;
    return input.syncResults.some((result) => {
      if (!result.scanStartISO || !result.scanEndExclusiveISO) return false;
      const scanStart = new Date(result.scanStartISO);
      const scanEnd = new Date(result.scanEndExclusiveISO);
      return !Number.isNaN(scanStart.getTime()) && !Number.isNaN(scanEnd.getTime()) &&
        scanStart <= coveredStart && scanEnd >= coveredEnd;
    });
  }).length;
  const ratio = elapsedWeekKeys.length ? jiraWeeks / elapsedWeekKeys.length : 1;
  return {
    requestedWeeks: requestedWeekKeys.length,
    elapsedWeeks: elapsedWeekKeys.length,
    jiraWeeks,
    bitbucketWeeks: new Set(input.reviewResults.filter((result) => requested.has(result.weekKey)).map((result) => result.weekKey)).size,
    ratio,
    status: ratio >= 0.8 ? "complete" : ratio >= 0.5 ? "partial" : "sparse",
    ticketCount: new Set(sources.map((source) => source.issueKey).filter(Boolean)).size,
    pullRequestCount: new Set(sources.filter((source) => source.pullRequestId).map((source) => `${source.repository}:${source.pullRequestId}`)).size,
    commitCount: input.reviewResults.reduce((sum, result) => sum + (result.commitGroups ?? []).filter((group) => inInterval(group.dateKey, input.interval)).reduce((n, group) => n + group.commitCount, 0), 0)
  };
};

export const buildDeterministicRecap = (input: RecapEvidenceInput, version = 1, now = new Date()): RecapDraftVersion => {
  const sources = buildRecapSources(input);
  return {
    schemaVersion: RECAP_SCHEMA_VERSION,
    version,
    generatedAt: now.toISOString(),
    generator: "deterministic",
    interval: input.interval,
    themes: buildRecapThemes(sources, input.interval.period),
    sources,
    coverage: buildRecapCoverage(input, sources, now)
  };
};

export const recapFormatMeta: Record<RecapFormat, { label: string; eyebrow: string; voice: string; sub: string }> = {
  perf: { label: "Performance review", eyebrow: "PERFORMANCE REVIEW", voice: "Reflective · factual", sub: "A connected account of your workstreams, grounded in Jira, code activity and local notes." },
  manager: { label: "Manager update", eyebrow: "MANAGER UPDATE", voice: "Plain · first-person", sub: "Readable workstream summaries that explain where your time and attention went." },
  cv: { label: "CV bullets", eyebrow: "RÉSUMÉ BULLETS", voice: "Action-led · evidence-first", sub: "Accomplishment candidates that stay honest when measurable impact is missing." },
  standup: { label: "Standup digest", eyebrow: "STANDUP DIGEST", voice: "Brief · present tense", sub: "The short version of what moved during this interval." },
  changelog: { label: "Changelog", eyebrow: "CHANGELOG", voice: "Technical · third-person", sub: "Release-style notes grouped by focus area." }
};

export const recapTitle = (format: RecapFormat, interval: RecapInterval, themes: RecapTheme[] = [], coverage?: RecapCoverage) => {
  const noun = interval.period;
  const isPartial = coverage?.status && coverage.status !== "complete";
  if (isPartial && format === "cv") return "Accomplishment candidates from available history";
  if (isPartial && format === "manager") return "What the available history shows";
  if (isPartial && format === "standup") return "Available work highlights";
  if (isPartial && format === "changelog") return `Partial release notes · ${interval.shortLabel}`;
  if (isPartial) return `A partial review of ${interval.shortLabel}`;
  if (format === "manager") return `Here’s where my ${noun} went.`;
  if (format === "cv") return "Selected accomplishment candidates";
  if (format === "standup") return `Work highlights from this ${noun}`;
  if (format === "changelog") return `Release notes · ${interval.shortLabel}`;
  const focus = themes[0]?.name.toLowerCase();
  if (focus && noun === "week") return `A focused week on ${focus}.`;
  if (focus && noun === "month") return `${themes[0].name} in review.`;
  if (focus) return `A quarter focused on ${focus}.`;
  return `Your ${noun}, reconstructed and ready to share.`;
};

export const visibleRecapParagraphs = (copy: RecapFormatCopy, detail: RecapDetail) =>
  detail === "headline" ? [] : detail === "balanced" ? (copy.paragraphs ?? []).slice(0, 1) : copy.paragraphs ?? [];

export const visibleRecapLines = (copy: RecapFormatCopy, detail: RecapDetail, format: RecapFormat) => {
  if (detail === "headline") return [];
  if (format === "perf" || format === "manager") return detail === "detailed" ? copy.lines.slice(0, 4) : [];
  return detail === "balanced" ? copy.lines.slice(0, 3) : copy.lines;
};

const withSentenceEnd = (value: string) => /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;

export const recapLineText = (line: RecapCopyLine, detail: RecapDetail, format: RecapFormat) => {
  const base = detail === "detailed" ? line.long : line.short;
  if (format !== "cv" || !line.userImpact?.trim()) return base;
  return `${withSentenceEnd(base)} ${withSentenceEnd(line.userImpact)}`;
};

export const recapCoverageNote = (draft: RecapDraftVersion) => {
  const elapsed = draft.coverage.elapsedWeeks ?? draft.coverage.requestedWeeks;
  if (draft.coverage.status === "complete" || draft.coverage.jiraWeeks >= elapsed) return undefined;
  return `Partial recap: Jira history is cached for ${draft.coverage.jiraWeeks} of ${elapsed} elapsed ${elapsed === 1 ? "week" : "weeks"}. The document covers available evidence only.`;
};

export const recapToPlainText = (draft: RecapDraftVersion, format: RecapFormat, detail: RecapDetail) => {
  const blocks = draft.themes.map((theme) => {
    const copy = theme.copy[format];
    const lead = format === "changelog" ? copy.version : copy.lead;
    const paragraphs = visibleRecapParagraphs(copy, detail).map((paragraph) => paragraph.text);
    const lines = visibleRecapLines(copy, detail, format).map((line) => `• ${recapLineText(line, detail, format)}`);
    return [theme.name, lead, ...paragraphs, ...lines]
      .filter(Boolean)
      .join("\n");
  });
  return [
    `${recapFormatMeta[format].label} · ${draft.interval.label}`,
    recapTitle(format, draft.interval, draft.themes, draft.coverage),
    recapCoverageNote(draft),
    blocks.join("\n\n")
  ].filter(Boolean).join("\n\n");
};

export const recapToMarkdown = (draft: RecapDraftVersion, format: RecapFormat, detail: RecapDetail) => {
  const blocks = draft.themes.map((theme) => {
    const copy = theme.copy[format];
    const lead = format === "changelog" ? copy.version : copy.lead;
    const paragraphs = visibleRecapParagraphs(copy, detail).map((paragraph) => paragraph.text);
    const lines = visibleRecapLines(copy, detail, format).map((line) => `- ${recapLineText(line, detail, format)}${line.refs.length ? ` (${line.refs.map((ref) => `\`${ref}\``).join(", ")})` : ""}`);
    return [`## ${theme.name}`, lead ? `**${lead}**` : "", ...paragraphs, ...lines]
      .filter(Boolean)
      .join("\n");
  });
  return [
    `# ${recapTitle(format, draft.interval, draft.themes, draft.coverage)}`,
    `_${recapFormatMeta[format].label} · ${draft.interval.label}_`,
    recapCoverageNote(draft) ? `> ${recapCoverageNote(draft)}` : "",
    blocks.join("\n\n")
  ].filter(Boolean).join("\n\n");
};
