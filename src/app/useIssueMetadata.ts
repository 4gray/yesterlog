import { useMemo } from "react";
import type {
  BitbucketReviewSyncResult,
  DayTrackingSummary,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
  PendingRecurringOccurrence,
  PersonalNote,
  RecurringEntry,
  SyncDayBucket,
  SyncResult,
  TicketsResult,
  WeekState
} from "../../shared/types";
import { toLocalDateKey } from "../utils/date";

const EMPTY_WORKLOGS: JiraWorklog[] = [];
const EMPTY_PERSONAL_NOTES: PersonalNote[] = [];
const EMPTY_RECURRING_ENTRIES: RecurringEntry[] = [];
const EMPTY_PENDING_RECURRING: PendingRecurringOccurrence[] = [];
const EMPTY_TICKETS: JiraTicket[] = [];

export interface IssueMetadataOptions {
  currentDate: Date;
  weekState: WeekState;
  syncResult?: SyncResult;
  bitbucketReviewResult?: BitbucketReviewSyncResult;
  personalNotes?: PersonalNote[];
  tickets?: TicketsResult;
  selectedTicket?: JiraTicket;
}

export interface IssueMetadata {
  visibleSyncResult?: SyncResult;
  visibleBitbucketReviewResult?: BitbucketReviewSyncResult;
  hoursByKey: Record<string, number>;
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraIssueTypeInfo>;
  todayKey: string;
  todaySummary?: DayTrackingSummary;
  /** Previous working day in the visible week (Tue–Fri). Undefined on the
   * week's first working day — the cross-week case is resolved separately. */
  prevDaySummary?: DayTrackingSummary;
  todayBucket?: SyncDayBucket;
  todayWorklogs: JiraWorklog[];
  todayPersonalNotes: PersonalNote[];
  /** Today's confirmed recurring rituals, for the Today calendar's committed lane. */
  todayRecurringEntries: RecurringEntry[];
  /** Today's scheduled-but-unconfirmed rituals, for the Today calendar's suggestion lane. */
  todayPendingRecurring: PendingRecurringOccurrence[];
  todayTrackedHours: number;
  touchedNotLogged: JiraTicket[];
}

const ticketsAsList = (tickets?: TicketsResult) =>
  tickets ? [...tickets.inProgress, ...tickets.recentlyClosed] : EMPTY_TICKETS;

export const buildIssueMetadata = ({
  currentDate,
  weekState,
  syncResult,
  bitbucketReviewResult,
  personalNotes = EMPTY_PERSONAL_NOTES,
  tickets,
  selectedTicket
}: IssueMetadataOptions): IssueMetadata => {
  const visibleSyncResult = syncResult?.weekKey === weekState.weekKey ? syncResult : undefined;
  const visibleBitbucketReviewResult =
    bitbucketReviewResult?.weekKey === weekState.weekKey ? bitbucketReviewResult : undefined;
  const ticketList = ticketsAsList(tickets);

  const hoursByKey: Record<string, number> = {};
  const issueUrlsByKey: Record<string, string> = {};
  const issueTypesByKey: Record<string, JiraIssueTypeInfo> = {};
  const visibleDayKeys = new Set(weekState.days.map((day) => day.dateKey));

  if (visibleSyncResult) {
    for (const [dateKey, bucket] of Object.entries(visibleSyncResult.daySummaries)) {
      const shouldCountHours = visibleDayKeys.has(dateKey);
      for (const issue of bucket.issues) {
        if (shouldCountHours) {
          hoursByKey[issue.key] = (hoursByKey[issue.key] ?? 0) + issue.loggedSeconds / 3600;
        }
        if (issue.url) {
          issueUrlsByKey[issue.key] = issue.url;
        }
        if (issue.issueType) {
          issueTypesByKey[issue.key] = issue.issueType;
        }
      }
    }
  }

  for (const ticket of ticketList) {
    issueUrlsByKey[ticket.key] = ticket.url;
    if (ticket.issueType) {
      issueTypesByKey[ticket.key] = ticket.issueType;
    }
  }

  if (selectedTicket) {
    issueUrlsByKey[selectedTicket.key] = selectedTicket.url;
    if (selectedTicket.issueType) {
      issueTypesByKey[selectedTicket.key] = selectedTicket.issueType;
    }
  }

  const todayKey = toLocalDateKey(currentDate);
  const todaySummary = weekState.days.find((day) => day.dateKey === todayKey);
  // The previous working day within the visible week — the last configured,
  // non-skipped day before today. `days` is weekday-ascending; empty on the
  // week's first working day (the Monday → last-Friday case crosses the week
  // boundary and is resolved separately).
  const priorWorkingDays = weekState.days.filter(
    (day) => day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey < todayKey
  );
  const prevDaySummary = priorWorkingDays[priorWorkingDays.length - 1];
  const todayBucket = visibleSyncResult?.daySummaries[todayKey];
  const todayWorklogs = todayBucket?.worklogs ?? EMPTY_WORKLOGS;
  const todayPersonalNotes =
    todaySummary?.personalNotes ?? personalNotes.filter((note) => note.dateKey === todayKey);
  const todayRecurringEntries = todaySummary?.recurringEntries ?? EMPTY_RECURRING_ENTRIES;
  const todayPendingRecurring = todaySummary?.pendingRecurring ?? EMPTY_PENDING_RECURRING;
  const todayNoteSeconds = todayPersonalNotes.reduce((sum, note) => sum + note.timeSpentSeconds, 0);
  const todayTrackedHours = todaySummary?.trackedHours ?? ((todayBucket?.trackedSeconds ?? 0) + todayNoteSeconds) / 3600;
  const loggedKeys = new Set(todayWorklogs.map((worklog) => worklog.issueKey));
  const touchedNotLogged = (tickets?.inProgress ?? EMPTY_TICKETS).filter((ticket) => !loggedKeys.has(ticket.key));

  return {
    visibleSyncResult,
    visibleBitbucketReviewResult,
    hoursByKey,
    issueUrlsByKey,
    issueTypesByKey,
    todayKey,
    todaySummary,
    prevDaySummary,
    todayBucket,
    todayWorklogs,
    todayPersonalNotes,
    todayRecurringEntries,
    todayPendingRecurring,
    todayTrackedHours,
    touchedNotLogged
  };
};

export const useIssueMetadata = (options: IssueMetadataOptions) =>
  useMemo(
    () => buildIssueMetadata(options),
    [
      options.bitbucketReviewResult,
      options.currentDate,
      options.personalNotes,
      options.selectedTicket,
      options.syncResult,
      options.tickets,
      options.weekState
    ]
  );
