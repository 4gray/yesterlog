import type {
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  PersonalNote,
  RecapColorToken,
  RecapCopyLine,
  RecapCoverage,
  RecapDetail,
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
    const label = `${DAY_SHORT.format(start)}–${DAY_SHORT.format(addDays(end, -1))} · Week ${getIsoWeekNumber(start)}`;
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
  const months = `${new Intl.DateTimeFormat(undefined, { month: "short" }).format(start)}–${new Intl.DateTimeFormat(undefined, { month: "short" }).format(addDays(end, -1))}`;
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
    map.set(source.id, { ...existing, timeSpentSeconds: existing.timeSpentSeconds + source.timeSpentSeconds });
  } else {
    map.set(source.id, source);
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

export const buildRecapSources = (input: RecapEvidenceInput): RecapSourceItem[] => {
  const sources = new Map<string, RecapSourceItem>();
  const signalSeconds = reconstructedSignalSeconds(input);
  for (const result of input.syncResults) {
    for (const [dateKey, day] of Object.entries(result.daySummaries)) {
      if (!inInterval(dateKey, input.interval)) continue;
      for (const worklog of day.worklogs) {
        addSource(sources, {
          id: `ticket:${worklog.issueKey}`,
          kind: "ticket",
          dateKey,
          title: worklog.issueSummary || worklog.issueKey,
          timeSpentSeconds: getWorklogDisplaySeconds(worklog),
          issueKey: worklog.issueKey,
          issueUrl: worklog.issueUrl,
          epicKey: worklog.epic?.key,
          epicSummary: worklog.epic?.summary,
          detail: worklog.comment,
          clusterKey: worklog.epic?.key ? `epic:${worklog.epic.key}` : `ticket:${worklog.issueKey}`
        });
      }
    }
  }
  for (const result of input.reviewResults) {
    for (const session of result.sessions) {
      if (!inInterval(session.dateKey, input.interval) || session.status === "logged") continue;
      const seconds = signalSeconds.get(session.id) ?? 0;
      if (!seconds) continue;
      addSource(sources, {
        id: `pr:${session.workspace}:${session.repositorySlug}:${session.pullRequestId}`,
        kind: "pull-request",
        dateKey: session.dateKey,
        title: session.pullRequestTitle,
        timeSpentSeconds: seconds,
        issueKey: session.jiraIssueKey,
        repository: session.repositoryName,
        pullRequestId: session.pullRequestId,
        pullRequestUrl: session.pullRequestUrl,
        role: session.isPullRequestAuthor ? "authored" : "reviewed",
        clusterKey: session.jiraIssueKey ? `ticket:${session.jiraIssueKey}` : `repo:${session.repositorySlug}`
      });
    }
    for (const group of result.commitGroups ?? []) {
      if (!inInterval(group.dateKey, input.interval)) continue;
      const seconds = signalSeconds.get(group.id) ?? 0;
      if (!seconds) continue;
      addSource(sources, {
        id: `commit:${group.id}`,
        kind: "commit",
        dateKey: group.dateKey,
        title: group.primaryMessage,
        timeSpentSeconds: seconds,
        issueKey: group.jiraIssueKey,
        repository: group.repositoryName,
        pullRequestId: group.pullRequestId,
        detail: `${group.commitCount} ${group.commitCount === 1 ? "commit" : "commits"}`,
        clusterKey: group.jiraIssueKey ? `ticket:${group.jiraIssueKey}` : `repo:${group.repositorySlug}`
      });
    }
  }
  for (const result of input.activityResults) {
    for (const activity of result.activities) {
      if (!inInterval(activity.dateKey, input.interval)) continue;
      const seconds = signalSeconds.get(activity.id) ?? 0;
      if (!seconds) continue;
      addSource(sources, {
        id: `activity:${activity.id}`,
        kind: "ticket",
        dateKey: activity.dateKey,
        title: activity.title || activity.issueSummary,
        timeSpentSeconds: seconds,
        issueKey: activity.issueKey,
        issueUrl: activity.issueUrl,
        epicKey: activity.epic?.key,
        epicSummary: activity.epic?.summary,
        detail: activity.description,
        clusterKey: activity.epic?.key ? `epic:${activity.epic.key}` : `ticket:${activity.issueKey}`
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

const sourceRef = (source: RecapSourceItem) =>
  source.issueKey || (source.pullRequestId ? `#${source.pullRequestId}` : source.id);

const lineForSource = (source: RecapSourceItem, index: number): RecapCopyLine => {
  const hours = source.timeSpentSeconds / 3600;
  const duration = hours >= 1 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(source.timeSpentSeconds / 60)}m`;
  const label = source.issueKey ? `${source.issueKey} · ${source.title}` : source.title;
  return {
    id: `line:${source.id}`,
    short: `${label} (${duration}).`,
    long: `${label} — ${duration} reconstructed from ${source.kind.replace("-", " ")} evidence.`,
    refs: [sourceRef(source)],
    tag: index === 0 ? "Added" : index % 3 === 1 ? "Changed" : "Fixed",
    emphasis: duration
  };
};

const formatCopy = (name: string, sources: RecapSourceItem[], format: RecapFormat): RecapFormatCopy => {
  const base = sources.map(lineForSource);
  const totalHours = Math.round((sources.reduce((sum, item) => sum + item.timeSpentSeconds, 0) / 3600) * 10) / 10;
  if (format === "cv") {
    return { lines: base.map((line) => ({ ...line, short: `Delivered ${line.short}`, long: `Delivered ${line.long}` })) };
  }
  if (format === "standup") {
    return { lead: `Advanced ${name.toLowerCase()}.`, lines: base };
  }
  if (format === "changelog") {
    return { version: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")} · ${totalHours}h`, lines: base };
  }
  if (format === "manager") {
    return { lead: `I focused on ${name.toLowerCase()}.`, lines: base };
  }
  return { lead: `Drove ${name.toLowerCase()} across the interval.`, lines: base };
};

const clusterName = (sources: RecapSourceItem[]) => {
  const first = sources[0];
  if (first.epicSummary) return first.epicSummary;
  if (first.epicKey) return first.epicKey;
  if (first.clusterKey === "local:meetings") return "Meetings & collaboration";
  if (first.clusterKey === "local:operations") return "Operations & support";
  if (first.repository && !first.issueKey) return `${first.repository} delivery`;
  return first.title;
};

export const buildRecapThemes = (sources: RecapSourceItem[], period: RecapPeriod): RecapTheme[] => {
  const grouped = new Map<string, RecapSourceItem[]>();
  for (const source of sources) grouped.set(source.clusterKey, [...(grouped.get(source.clusterKey) ?? []), source]);
  const clusters = [...grouped.values()].sort(
    (a, b) => b.reduce((sum, item) => sum + item.timeSpentSeconds, 0) - a.reduce((sum, item) => sum + item.timeSpentSeconds, 0)
  );
  const limit = period === "week" ? 1 : period === "month" ? 2 : 3;
  const selected = clusters.slice(0, limit);
  if (clusters.length > limit) selected[limit - 1] = selected[limit - 1].concat(...clusters.slice(limit));
  return selected.map((items, index) => {
    const name = clusters.length > limit && index === limit - 1 ? "Other contributions" : clusterName(items);
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

export const buildRecapCoverage = (input: RecapEvidenceInput, sources: RecapSourceItem[]): RecapCoverage => {
  const requestedWeekKeys = recapWeekKeys(input.interval);
  const requested = new Set(requestedWeekKeys);
  return {
    requestedWeeks: requestedWeekKeys.length,
    jiraWeeks: new Set(input.syncResults.filter((result) => requested.has(result.weekKey)).map((result) => result.weekKey)).size,
    bitbucketWeeks: new Set(input.reviewResults.filter((result) => requested.has(result.weekKey)).map((result) => result.weekKey)).size,
    ticketCount: new Set(sources.map((source) => source.issueKey).filter(Boolean)).size,
    pullRequestCount: new Set(sources.filter((source) => source.pullRequestId).map((source) => `${source.repository}:${source.pullRequestId}`)).size,
    commitCount: input.reviewResults.reduce((sum, result) => sum + (result.commitGroups ?? []).filter((group) => inInterval(group.dateKey, input.interval)).reduce((n, group) => n + group.commitCount, 0), 0)
  };
};

export const buildDeterministicRecap = (input: RecapEvidenceInput, version = 1, now = new Date()): RecapDraftVersion => {
  const sources = buildRecapSources(input);
  return {
    version,
    generatedAt: now.toISOString(),
    generator: "deterministic",
    interval: input.interval,
    themes: buildRecapThemes(sources, input.interval.period),
    sources,
    coverage: buildRecapCoverage(input, sources)
  };
};

export const recapFormatMeta: Record<RecapFormat, { label: string; eyebrow: string; voice: string; sub: string }> = {
  perf: { label: "Performance review", eyebrow: "PERFORMANCE REVIEW", voice: "Confident · factual", sub: "Grounded in your Git, PRs, Jira and local time. Edit anything before you save." },
  manager: { label: "Manager update", eyebrow: "MANAGER UPDATE", voice: "Plain · first-person", sub: "A plain-language account of where the interval went." },
  cv: { label: "CV bullets", eyebrow: "RÉSUMÉ BULLETS", voice: "Terse · impact-first", sub: "Impact-first bullets ready to refine for a résumé or profile." },
  standup: { label: "Standup digest", eyebrow: "STANDUP DIGEST", voice: "Brief · present tense", sub: "The short version of what moved during this interval." },
  changelog: { label: "Changelog", eyebrow: "CHANGELOG", voice: "Technical · third-person", sub: "Release-style notes grouped by focus area." }
};

export const recapTitle = (format: RecapFormat, interval: RecapInterval, themes: RecapTheme[] = []) => {
  const noun = interval.period;
  if (format === "manager") return `Here’s where my ${noun} went.`;
  if (format === "cv") return "Selected accomplishments";
  if (format === "standup") return `Shipped this ${noun}`;
  if (format === "changelog") return `Release notes · ${interval.shortLabel}`;
  const focus = themes[0]?.name.toLowerCase();
  if (focus && noun === "week") return `A focused week on ${focus}.`;
  if (focus && noun === "month") return `${themes[0].name} defined your month.`;
  if (focus) return `You drove ${focus} this quarter.`;
  return `Your ${noun}, reconstructed and ready to share.`;
};

const visibleLines = (copy: RecapFormatCopy, detail: RecapDetail) =>
  detail === "headline" ? [] : detail === "balanced" ? copy.lines.slice(0, 2) : copy.lines;

export const recapToPlainText = (draft: RecapDraftVersion, format: RecapFormat, detail: RecapDetail) => {
  const blocks = draft.themes.map((theme) => {
    const copy = theme.copy[format];
    const lead = format === "changelog" ? copy.version : copy.lead;
    return [theme.name, lead, ...visibleLines(copy, detail).map((line) => `• ${detail === "detailed" ? line.long : line.short}`)]
      .filter(Boolean)
      .join("\n");
  });
  return `${recapFormatMeta[format].label} · ${draft.interval.label}\n${recapTitle(format, draft.interval, draft.themes)}\n\n${blocks.join("\n\n")}`;
};

export const recapToMarkdown = (draft: RecapDraftVersion, format: RecapFormat, detail: RecapDetail) => {
  const blocks = draft.themes.map((theme) => {
    const copy = theme.copy[format];
    const lead = format === "changelog" ? copy.version : copy.lead;
    return [`## ${theme.name}`, lead ? `**${lead}**` : "", ...visibleLines(copy, detail).map((line) => `- ${detail === "detailed" ? line.long : line.short}${line.refs.length ? ` (${line.refs.map((ref) => `\`${ref}\``).join(", ")})` : ""}`)]
      .filter(Boolean)
      .join("\n");
  });
  return `# ${recapTitle(format, draft.interval, draft.themes)}\n\n_${recapFormatMeta[format].label} · ${draft.interval.label}_\n\n${blocks.join("\n\n")}`;
};
