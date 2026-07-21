import type {
  AppSettings,
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  JiraTicket,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WorklogAllocationPreference
} from "../../shared/types";
import { ReconstructView } from "../components/ReconstructView";
import type { AppSyncState } from "./useSyncControls";
import type { AddTimePrefill } from "../components/AddTimeModal";
import type { ReconstructDay, TimelineRow } from "../domain/reconstruct";
import { useReconstruct } from "./useReconstruct";

export interface AppReconRouteProps {
  currentDate: Date;
  settings: AppSettings;
  syncResult?: SyncResult;
  jiraActivityResult?: JiraActivitySyncResult;
  reviewResult?: BitbucketReviewSyncResult;
  localWeekKey: string;
  personalNotes: PersonalNote[];
  recurringEvents: RecurringEvent[];
  recurringOccurrences: RecurringOccurrence[];
  allocationSkippedDates?: string[];
  worklogAllocationPreferences?: WorklogAllocationPreference[];
  dailyTargetHours: number;
  syncState: AppSyncState;
  syncLabel: string;
  onSync: () => void;
  onOpenSettings: () => void;
  onLogTime: (date?: Date, prefill?: AddTimePrefill) => void;
}

const jiraBrowseUrl = (jiraBaseUrl: string, issueKey: string) => {
  const base = jiraBaseUrl.trim().replace(/\/+$/, "");
  return base ? `${base}/browse/${issueKey}` : "";
};

const ticketFromReconstructRow = (row: TimelineRow, jiraBaseUrl: string): JiraTicket | undefined => {
  const issueKey = row.key.trim().toUpperCase();
  if (!issueKey) {
    return undefined;
  }

  const projectKey = issueKey.split("-")[0] || issueKey;
  return {
    id: issueKey,
    key: issueKey,
    summary: row.title.trim() || issueKey,
    projectKey,
    projectName: projectKey,
    statusName: "Unknown",
    statusCategory: "unknown",
    loggedSecondsTotal: 0,
    url: jiraBrowseUrl(jiraBaseUrl, issueKey)
  };
};

const startedIsoFromRow = (dateKey: string, hour: string) => {
  const started = new Date(`${dateKey}T${hour}:00`);
  return Number.isNaN(started.getTime()) ? undefined : started.toISOString();
};

export const buildReconstructAddTimePrefill = (
  day: ReconstructDay,
  jiraBaseUrl: string
): AddTimePrefill | undefined => {
  const row = day.rows.find((candidate) => candidate.kind === "filled" && candidate.durationMinutes > 0);
  if (!row) {
    return undefined;
  }

  const comment = (row.aiDraft ?? row.naiveDescription).trim();
  return {
    ticket: ticketFromReconstructRow(row, jiraBaseUrl),
    timeSpentSeconds: row.durationMinutes * 60,
    startedISO: startedIsoFromRow(day.dateKey, row.hour),
    comment: comment || undefined
  };
};

export const AppReconRoute = ({
  currentDate,
  settings,
  syncResult,
  jiraActivityResult,
  reviewResult,
  localWeekKey,
  personalNotes,
  recurringEvents,
  recurringOccurrences,
  allocationSkippedDates,
  worklogAllocationPreferences,
  dailyTargetHours,
  syncState,
  syncLabel,
  onSync,
  onOpenSettings,
  onLogTime
}: AppReconRouteProps) => {
  const vm = useReconstruct({
    currentDate,
    settings,
    syncResult,
    jiraActivityResult,
    reviewResult,
    localWeekKey,
    personalNotes,
    recurringEvents,
    recurringOccurrences,
    allocationSkippedDates,
    worklogAllocationPreferences,
    dailyTargetHours
  });

  return (
    <ReconstructView
      day={vm.day}
      summary={vm.summary}
      dateLabels={vm.dateLabels}
      aiOn={vm.aiOn}
      aiProvider={vm.aiProvider}
      aiModel={vm.aiModel}
      isEnhancing={vm.isEnhancing}
      canStepBack={vm.canStepBack}
      canStepForward={vm.canStepForward}
      onStepBack={vm.stepBack}
      onStepForward={vm.stepForward}
      onOpenSettings={onOpenSettings}
      onPrimaryAction={vm.aiOn ? vm.refreshAi : vm.distribute}
      onStopAi={vm.stopAi}
      onLogTime={() => onLogTime(vm.selectedDate, buildReconstructAddTimePrefill(vm.day, settings.jiraBaseUrl))}
      syncState={syncState}
      syncLabel={syncLabel}
      onSync={onSync}
      onPlaceSignal={vm.placeSignal}
      onUnplaceSignal={vm.unplaceSignal}
      onPlaceAll={vm.placeAllSignals}
      onAdjustDuration={vm.adjustDuration}
    />
  );
};
