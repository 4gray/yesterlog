import { useMemo } from "react";
import type {
  BitbucketReviewSyncResult,
  DayTrackingSummary,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  SyncDayBucket,
  SyncResult,
  TicketsResult,
  WeekState
} from "../../shared/types";
import { toLocalDateKey } from "../utils/date";

const EMPTY_WORKLOGS: JiraWorklog[] = [];
const EMPTY_PERSONAL_NOTES: PersonalNote[] = [];
const EMPTY_TICKETS: JiraTicket[] = [];

export interface IssueMetadataOptions {
  currentDate: Date;
  weekState: WeekState;
  syncResult?: SyncResult;
  bitbucketReviewResult?: BitbucketReviewSyncResult;
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
  todayBucket?: SyncDayBucket;
  todayWorklogs: JiraWorklog[];
  todayPersonalNotes: PersonalNote[];
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

  if (visibleSyncResult) {
    for (const bucket of Object.values(visibleSyncResult.daySummaries)) {
      for (const issue of bucket.issues) {
        hoursByKey[issue.key] = (hoursByKey[issue.key] ?? 0) + issue.loggedSeconds / 3600;
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
  const todayBucket = visibleSyncResult?.daySummaries[todayKey];
  const todayWorklogs = todayBucket?.worklogs ?? EMPTY_WORKLOGS;
  const todayPersonalNotes = todaySummary?.personalNotes ?? EMPTY_PERSONAL_NOTES;
  const todayTrackedHours = todaySummary?.trackedHours ?? (todayBucket?.trackedSeconds ?? 0) / 3600;
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
    todayBucket,
    todayWorklogs,
    todayPersonalNotes,
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
      options.selectedTicket,
      options.syncResult,
      options.tickets,
      options.weekState
    ]
  );
