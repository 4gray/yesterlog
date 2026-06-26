import type { WeekdayNumber } from "../../shared/types";

/**
 * Day Reconstruction — deterministic core engine.
 *
 * This module rebuilds a single day's proposed worklog from the signals TimeBro already
 * syncs (Bitbucket PR reviews) plus the Jira worklogs already logged for that day. It is
 * a pure, fully deterministic engine with **no model and no network** — it is the product
 * core and works completely on its own. An optional local-AI layer (`enhancePrompt.ts` +
 * `api/ollama.ts`) can polish the naive descriptions afterwards, but is never required.
 *
 * Future signal sources (commits, CI runs, Jira changelog) slot in as additional
 * `ReconstructSignal`s without changing this contract.
 */

export type ReconstructDayKind = "today" | "past" | "complete" | "weekend";

/** Signal source. `pipe` = CI pipeline, `jira` = Jira changelog marker. */
export type SignalKind = "commit" | "pr" | "pipe" | "jira";

export type ReconstructConfidence = "high" | "med" | "low";

export interface ReconstructSignal {
  id: string;
  kind: SignalKind;
  /** Ticket key (e.g. `FTDM-328`) or "" when none could be derived. */
  key: string;
  title: string;
  /** Mono sub-line: "web-app · 5 commits · 09:12–11:05". */
  sub: string;
  /** Estimated minutes; `0` for a zero-duration marker (e.g. a status transition). */
  durationMinutes: number;
  /** True for an instant event (Jira changelog transition) that has no duration. */
  isMarker: boolean;
  confidence: ReconstructConfidence;
  /** Local start hour [0..23], used to place the signal on the timeline. */
  startHour: number;
  /** Factual, model-free description used when this signal becomes a timeline entry. */
  naiveDescription: string;
}

export type TimelineRowKind = "filled" | "locked" | "empty";

export interface TimelineRow {
  /** "09:00" … "17:00". */
  hour: string;
  kind: TimelineRowKind;
  signalKind?: SignalKind;
  /** Source signal id for a placed (filled-from-signal) row — used for drag/drop. */
  signalId?: string;
  key: string;
  title: string;
  /** Factual sub-line; for locked rows: "already in Jira · 1h 15m". */
  sub: string;
  durationMinutes: number;
  /**
   * Factual description, always present. The optional AI layer may overlay a cleaner
   * `aiDraft`; the view renders `aiDraft` only when AI is enabled and one exists.
   */
  naiveDescription: string;
  aiDraft?: string;
  /** Inferred context for a gap; only meaningful with the AI layer. */
  gapText?: string;
  gapCta?: string;
}

export interface ReconstructDay {
  dateKey: string;
  kind: ReconstructDayKind;
  /** Whether the reconstructed day is the current calendar day. */
  isToday: boolean;
  signals: ReconstructSignal[];
  rows: TimelineRow[];
  targetMinutes: number;
  /**
   * Minutes that can be accounted for *so far*: the full target for a finished day, but
   * only the elapsed working time for today (you can't reconstruct hours that haven't
   * happened). Drives the gap and auto-distribute.
   */
  accountableMinutes: number;
  /** Sum of proposed (filled) row durations. */
  reconstructedMinutes: number;
  /** Sum of already-logged (locked) row durations — read via worklogDate. */
  loggedMinutes: number;
  /** Unaccounted minutes against {@link accountableMinutes} (never negative). */
  gapMinutes: number;
  /** Number of proposed entries that could be sent to Jira. */
  sendCount: number;
  /** Effective signal→hour placement used to assemble the timeline (drag/drop draft). */
  placements: PlacementMap;
  /** Ids of placeable signals not currently on the timeline (shown in the rail). */
  unplacedSignalIds: string[];
}

/** signalId → assigned working hour (9..17). Absent ⇒ unplaced (sits in the rail). */
export type PlacementMap = Record<string, number>;

/** Narrowed Jira worklog shape — only what the engine needs. */
export interface ReconstructWorklog {
  issueKey: string;
  issueSummary: string;
  startedISO: string;
  timeSpentSeconds: number;
  comment?: string;
}

/** Narrowed Bitbucket review-session shape — only what the engine needs. */
export interface ReconstructReviewSession {
  id: string;
  jiraIssueKey?: string;
  pullRequestId: number;
  pullRequestTitle: string;
  repositoryName: string;
  startedISO: string;
  endedISO: string;
  estimatedSeconds: number;
  commentCount: number;
  confidence: "high" | "medium" | "low";
  /** True when this review is already logged to Jira (shows as locked, not a signal). */
  logged?: boolean;
  /**
   * True when the current user authored the PR. Activity on your own PR is coordination,
   * not review — it is surfaced as a low-confidence "on your PR" work signal, never a
   * "Review" entry.
   */
  isPullRequestAuthor?: boolean;
}

/** Narrowed Bitbucket commit-group shape — the user's own coding work for a day. */
export interface ReconstructCommitGroup {
  id: string;
  jiraIssueKey?: string;
  pullRequestId?: number;
  branch?: string;
  repositoryName: string;
  primaryMessage: string;
  commitCount: number;
  firstCommitISO: string;
  lastCommitISO: string;
  estimatedSeconds: number;
  confidence: "high" | "medium" | "low";
}

export interface ReconstructInput {
  dateKey: string;
  /** ISO weekday 1..7 (Mon..Sun). */
  weekdayIso: number;
  isToday: boolean;
  workingDays: WeekdayNumber[];
  targetMinutes: number;
  worklogs: ReconstructWorklog[];
  reviewSessions: ReconstructReviewSession[];
  /** The user's own commit runs for the day (their coding work). */
  commits?: ReconstructCommitGroup[];
  /**
   * Local minutes since midnight "now" — only meaningful when {@link isToday}. When set,
   * the timeline stops at the current hour (no future gap rows) and the gap is measured
   * against elapsed working time rather than the full target.
   */
  nowMinutes?: number;
}

const WORKING_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const GAP_CTA_DEFAULT = "Add";

const pad2 = (value: number) => String(value).padStart(2, "0");

/** "1h 50m", "40m", "0m" — optionally with a "~" estimate prefix. */
export const formatReconDuration = (minutes: number, options: { estimate?: boolean } = {}): string => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  const body = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
  return options.estimate ? `~${body}` : body;
};

const localHourOf = (iso: string): number => {
  const date = new Date(iso);
  const hour = date.getHours();
  return Number.isFinite(hour) ? hour : 9;
};

const hourLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getHours()}:${pad2(date.getMinutes())}`;
};

const mapConfidence = (value: "high" | "medium" | "low"): ReconstructConfidence =>
  value === "medium" ? "med" : value;

const isWorkingDay = (input: ReconstructInput) => input.workingDays.includes(input.weekdayIso as WeekdayNumber);

/** Maps unlogged review sessions to draggable signals (sorted by start time). */
export const buildSignals = (sessions: ReconstructReviewSession[]): ReconstructSignal[] =>
  sessions
    .filter((session) => !session.logged)
    .slice()
    .sort((a, b) => a.startedISO.localeCompare(b.startedISO))
    .map((session) => {
      const minutes = Math.round(session.estimatedSeconds / 60);
      const range =
        hourLabel(session.startedISO) && hourLabel(session.endedISO)
          ? `${hourLabel(session.startedISO)}–${hourLabel(session.endedISO)}`
          : "";
      const commentLabel =
        session.commentCount > 0
          ? `${session.commentCount} ${session.commentCount === 1 ? "comment" : "comments"}`
          : "no comments";
      const isOwn = Boolean(session.isPullRequestAuthor);
      return {
        id: session.id,
        kind: "pr" as const,
        key: session.jiraIssueKey?.trim().toUpperCase() ?? "",
        // Activity on your own PR is coordination, not review — label and weight it as such.
        title: isOwn ? `On your PR: ${session.pullRequestTitle}` : `Review: ${session.pullRequestTitle}`,
        sub: [`${session.repositoryName} · PR #${session.pullRequestId}`, commentLabel, range]
          .filter(Boolean)
          .join(" · "),
        durationMinutes: minutes,
        isMarker: false,
        confidence: isOwn ? "low" : mapConfidence(session.confidence),
        startHour: localHourOf(session.startedISO),
        naiveDescription: naivePrDescription(session)
      };
    });

/** Maps the user's commit runs to draggable "commit" work signals (sorted by start). */
export const buildCommitSignals = (commits: ReconstructCommitGroup[]): ReconstructSignal[] =>
  commits
    .slice()
    .sort((a, b) => a.firstCommitISO.localeCompare(b.firstCommitISO))
    .map((group) => {
      const minutes = Math.round(group.estimatedSeconds / 60);
      const range =
        hourLabel(group.firstCommitISO) && hourLabel(group.lastCommitISO)
          ? `${hourLabel(group.firstCommitISO)}–${hourLabel(group.lastCommitISO)}`
          : "";
      const commitLabel = `${group.commitCount} ${group.commitCount === 1 ? "commit" : "commits"}`;
      return {
        id: group.id,
        kind: "commit" as const,
        key: group.jiraIssueKey?.trim().toUpperCase() ?? "",
        title: group.primaryMessage,
        sub: [group.repositoryName, commitLabel, range].filter(Boolean).join(" · "),
        durationMinutes: minutes,
        isMarker: false,
        confidence: mapConfidence(group.confidence),
        startHour: localHourOf(group.firstCommitISO),
        naiveDescription: naiveCommitDescription(group)
      };
    });

/** Factual, model-free description for a proposed PR-review entry. */
const naivePrDescription = (session: ReconstructReviewSession): string => {
  const count = session.commentCount;
  if (session.isPullRequestAuthor) {
    const activity = count > 0 ? ` — ${count} ${count === 1 ? "comment/reply" : "comments/replies"}` : "";
    return `Worked on your pull request #${session.pullRequestId} (${session.pullRequestTitle}) in ${session.repositoryName}${activity}.`;
  }
  const activity = count > 0 ? ` and left ${count} ${count === 1 ? "comment" : "comments"}` : "";
  return `Reviewed pull request #${session.pullRequestId} (${session.pullRequestTitle}) in ${session.repositoryName}${activity}.`;
};

/** Factual, model-free description for a proposed commit entry. */
const naiveCommitDescription = (group: ReconstructCommitGroup): string => {
  const where = group.branch ? ` on ${group.branch}` : ` in ${group.repositoryName}`;
  const count = `${group.commitCount} ${group.commitCount === 1 ? "commit" : "commits"}`;
  return `${group.primaryMessage} — ${count}${where}.`;
};

/**
 * Places items onto the 09:00–17:00 grid, one per hour. Collisions are bumped to the next
 * free working hour. Items that cannot fit the grid (a very busy day) are returned as
 * `overflow` rather than dropped, so totals always match what is rendered.
 */
const placeByHour = <T>(
  items: Array<{ hour: number; value: T }>
): { placed: Map<number, T>; overflow: Array<{ hour: number; value: T }> } => {
  const placed = new Map<number, T>();
  const overflow: Array<{ hour: number; value: T }> = [];
  const ordered = items.slice().sort((a, b) => a.hour - b.hour);
  for (const item of ordered) {
    const clamped = Math.min(17, Math.max(9, item.hour));
    let hour = clamped;
    while (placed.has(hour) && hour < 17) {
      hour += 1;
    }
    if (placed.has(hour)) {
      // grid full from this hour up — walk back down to the first free slot
      let back = hour;
      while (placed.has(back) && back > 9) {
        back -= 1;
      }
      hour = back;
    }
    if (placed.has(hour)) {
      overflow.push({ hour: clamped, value: item.value });
    } else {
      placed.set(hour, item.value);
    }
  }
  return { placed, overflow };
};

interface PlacedContent {
  kind: "filled" | "locked";
  row: TimelineRow;
  minutes: number;
}

export const buildReconstructDay = (input: ReconstructInput, placements?: PlacementMap): ReconstructDay => {
  const commits = input.commits ?? [];
  const signals = [...buildCommitSignals(commits), ...buildSignals(input.reviewSessions)].sort(
    (a, b) => a.startHour - b.startHour
  );
  const hasActivity = input.worklogs.length > 0 || input.reviewSessions.length > 0 || commits.length > 0;
  const workingDay = isWorkingDay(input);

  const loggedMinutes = input.worklogs.reduce((sum, w) => sum + Math.round(w.timeSpentSeconds / 60), 0);

  // ---- "now" cap for today: never reconstruct hours that haven't happened ----
  const dayStartMinutes = WORKING_HOURS[0] * 60;
  const capNow = input.isToday && typeof input.nowMinutes === "number";
  const lastGapHour = capNow ? Math.min(17, Math.max(9, Math.floor(input.nowMinutes! / 60))) : 17;
  const accountableMinutes = capNow
    ? Math.max(0, Math.min(input.targetMinutes, input.nowMinutes! - dayStartMinutes))
    : input.targetMinutes;

  // ---- day kind -----------------------------------------------------------
  let kind: ReconstructDayKind;
  if (!workingDay && !hasActivity) {
    kind = "weekend";
  } else {
    const proposable = signals.filter((s) => !s.isMarker && s.durationMinutes > 0);
    const fullyLogged = proposable.length === 0 && loggedMinutes >= input.targetMinutes;
    if (fullyLogged && input.worklogs.length > 0) {
      kind = "complete";
    } else if (input.isToday) {
      kind = "today";
    } else {
      kind = "past";
    }
  }

  if (kind === "weekend") {
    return {
      dateKey: input.dateKey,
      kind,
      isToday: input.isToday,
      signals: [],
      rows: [],
      targetMinutes: input.targetMinutes,
      accountableMinutes: 0,
      reconstructedMinutes: 0,
      loggedMinutes: 0,
      gapMinutes: 0,
      sendCount: 0,
      placements: {},
      unplacedSignalIds: []
    };
  }

  // ---- place locked worklogs + proposed signal rows -----------------------
  const lockedItems = input.worklogs.map((worklog) => {
    const minutes = Math.round(worklog.timeSpentSeconds / 60);
    const row: TimelineRow = {
      hour: "",
      kind: "locked",
      key: worklog.issueKey,
      title: worklog.issueSummary || worklog.issueKey,
      sub: `already in Jira · ${formatReconDuration(minutes)}`,
      durationMinutes: minutes,
      naiveDescription: worklog.comment?.trim() || worklog.issueSummary || ""
    };
    return { hour: localHourOf(worklog.startedISO), value: { kind: "locked" as const, row, minutes } };
  });

  const placeable = signals.filter((signal) => !signal.isMarker && signal.durationMinutes > 0);
  const clampHour = (hour: number) => Math.min(17, Math.max(9, hour));
  // No placement map ⇒ auto-place every signal at its estimated hour (default view).
  const effective: PlacementMap =
    placements ?? Object.fromEntries(placeable.map((signal) => [signal.id, clampHour(signal.startHour)]));

  const filledItems = placeable
    .filter((signal) => typeof effective[signal.id] === "number")
    .map((signal) => {
      const row: TimelineRow = {
        hour: "",
        kind: "filled",
        signalId: signal.id,
        signalKind: signal.kind,
        key: signal.key,
        title: signal.title,
        sub: signal.sub,
        durationMinutes: signal.durationMinutes,
        naiveDescription: signal.naiveDescription
      };
      return { hour: clampHour(effective[signal.id]), value: { kind: "filled" as const, row, minutes: signal.durationMinutes } };
    });

  const unplacedSignalIds = placeable
    .filter((signal) => typeof effective[signal.id] !== "number")
    .map((signal) => signal.id);

  const { placed, overflow } = placeByHour<PlacedContent>([...lockedItems, ...filledItems]);

  // Every placed filled item is rendered (placed or overflow), so totals match the timeline.
  const reconstructedMinutes = filledItems.reduce((sum, item) => sum + item.value.minutes, 0);

  // ---- assemble rows ------------------------------------------------------
  const rows: TimelineRow[] = [];
  for (const hour of WORKING_HOURS) {
    const content = placed.get(hour);
    const label = `${pad2(hour)}:00`;
    if (content) {
      rows.push({ ...content.row, hour: label });
    } else if (kind !== "complete" && hour <= lastGapHour) {
      // Skip empty hours that haven't happened yet on today — no future "gaps".
      rows.push({
        hour: label,
        kind: "empty",
        key: "",
        title: "",
        sub: "",
        durationMinutes: 0,
        naiveDescription: "",
        gapText: "Gap — no signals here. Add an entry by hand.",
        gapCta: GAP_CTA_DEFAULT
      });
    }
  }
  // Busy-day overflow: append any item that did not fit a free hour slot.
  for (const item of overflow.sort((a, b) => a.hour - b.hour)) {
    rows.push({ ...item.value.row, hour: `${pad2(item.hour)}:00` });
  }

  const gapMinutes = Math.max(0, accountableMinutes - reconstructedMinutes - loggedMinutes);

  return {
    dateKey: input.dateKey,
    kind,
    isToday: input.isToday,
    signals,
    rows,
    targetMinutes: input.targetMinutes,
    accountableMinutes,
    reconstructedMinutes,
    loggedMinutes,
    gapMinutes,
    sendCount: filledItems.length,
    placements: effective,
    unplacedSignalIds
  };
};

export interface ReconstructSummary {
  bigLabel: string;
  bigWord: string;
  sub: string;
  gapLabel: string;
  footerTail: string;
  sendBtnLabel: string;
  unplacedLabel: string;
  dayTag: "TODAY" | "PAST DAY" | "WEEKEND";
}

/** Pure header/footer label derivation, kept here so it is unit-testable. */
export const getReconstructSummary = (day: ReconstructDay): ReconstructSummary => {
  const target = day.targetMinutes;
  if (day.kind === "weekend") {
    return {
      bigLabel: "Weekend",
      bigWord: "rest day",
      sub: "· no work expected",
      gapLabel: "0m",
      footerTail: "",
      sendBtnLabel: "",
      unplacedLabel: "0 unplaced",
      dayTag: "WEEKEND"
    };
  }
  if (day.kind === "complete") {
    return {
      bigLabel: formatReconDuration(day.loggedMinutes),
      bigWord: "logged",
      sub: `· ${formatReconDuration(day.loggedMinutes)} of ${formatReconDuration(target)} · on target`,
      gapLabel: "0m",
      footerTail: "fully reconstructed · nothing left",
      sendBtnLabel: "Everything is logged",
      unplacedLabel: "0 unplaced",
      dayTag: day.isToday ? "TODAY" : "PAST DAY"
    };
  }
  const accounted = day.reconstructedMinutes + day.loggedMinutes;
  return {
    bigLabel: formatReconDuration(day.reconstructedMinutes),
    bigWord: "reconstructed",
    sub: `· ${formatReconDuration(accounted)} of ${formatReconDuration(target)} accounted`,
    gapLabel: formatReconDuration(day.gapMinutes),
    footerTail: day.isToday ? "unaccounted so far" : "still unaccounted",
    sendBtnLabel: `Log ${day.sendCount} ${day.sendCount === 1 ? "entry" : "entries"} in Jira`,
    unplacedLabel: `${day.unplacedSignalIds.length} unplaced`,
    dayTag: day.kind === "today" ? "TODAY" : "PAST DAY"
  };
};

/**
 * Rule-based auto-distribute (core, deterministic, no model): proportionally fills the
 * day's empty gap rows with the remaining minutes-to-target, turning each into an
 * editable proposed entry. Returns the day unchanged when there is no gap or no empty row.
 */
export const autoDistribute = (day: ReconstructDay): ReconstructDay => {
  if (day.kind !== "today" && day.kind !== "past") {
    return day;
  }
  const emptyIndexes = day.rows.reduce<number[]>((acc, row, index) => {
    if (row.kind === "empty") {
      acc.push(index);
    }
    return acc;
  }, []);
  if (emptyIndexes.length === 0 || day.gapMinutes <= 0) {
    return day;
  }

  const perRow = Math.max(5, Math.round(day.gapMinutes / emptyIndexes.length / 5) * 5);
  let remaining = day.gapMinutes;
  const rows = day.rows.slice();
  for (const index of emptyIndexes) {
    if (remaining <= 0) {
      break;
    }
    const minutes = Math.min(perRow, remaining);
    remaining -= minutes;
    rows[index] = {
      hour: rows[index].hour,
      kind: "filled",
      key: "",
      title: "Focused work",
      sub: "",
      durationMinutes: minutes,
      naiveDescription: "Auto-distributed time to reach the daily target — adjust before logging."
    };
  }

  const reconstructedMinutes = day.reconstructedMinutes + (day.gapMinutes - remaining);
  return {
    ...day,
    rows,
    reconstructedMinutes,
    gapMinutes: Math.max(0, day.accountableMinutes - reconstructedMinutes - day.loggedMinutes),
    sendCount: rows.filter((row) => row.kind === "filled").length
  };
};
