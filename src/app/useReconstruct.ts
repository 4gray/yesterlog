import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings, BitbucketReviewSyncResult, SyncResult } from "../../shared/types";
import { enhanceReconstructDay, probeOllama } from "../api/ollama";
import type {
  ReconstructCommitGroup,
  ReconstructDay,
  ReconstructReviewSession,
  ReconstructWorklog
} from "../domain/reconstruct";
import { autoDistribute, buildReconstructDay, getReconstructSummary } from "../domain/reconstruct";
import type { ReconstructDateLabels } from "../components/ReconstructView";
import { getBitbucketReviewResult, getSyncResult } from "../storage/db";
import { addDays, fromLocalDateKey, isoWeekday, startOfWeekMonday, toLocalDateKey } from "../utils/date";

/** Trailing days the stepper spans, ending today — the worklog sync/edit window. */
const WINDOW_DAYS = 14;

interface UseReconstructOptions {
  currentDate: Date;
  settings: AppSettings;
  syncResult?: SyncResult;
  reviewResult?: BitbucketReviewSyncResult;
  dailyTargetHours: number;
}

interface WindowDay {
  date: Date;
  dateKey: string;
  weekdayIso: number;
  isToday: boolean;
}

const upper = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(date).toUpperCase();

const buildDateLabels = (date: Date): ReconstructDateLabels => ({
  longLabel: `${upper(date, { weekday: "long" })} ${date.getDate()} ${upper(date, { month: "long" })}`,
  shortLabel: `${upper(date, { weekday: "short" })} ${date.getDate()} ${upper(date, { month: "short" })}`
});

const weekKeyOf = (dateKey: string) => toLocalDateKey(startOfWeekMonday(fromLocalDateKey(dateKey)));

/**
 * Derives the Reconstruct view-model for the trailing ~2-week sync window. The
 * deterministic day is always produced from data TimeBro already holds (current week in
 * memory, earlier weeks loaded from local storage). The optional local model and the
 * rule-based auto-distribute only ever transform that core day — neither is required.
 */
export const useReconstruct = ({
  currentDate,
  settings,
  syncResult,
  reviewResult,
  dailyTargetHours
}: UseReconstructOptions) => {
  const todayKey = toLocalDateKey(currentDate);

  const days = useMemo<WindowDay[]>(() => {
    const todayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    return Array.from({ length: WINDOW_DAYS }, (_, index) => {
      const date = addDays(todayStart, -(WINDOW_DAYS - 1 - index));
      const dateKey = toLocalDateKey(date);
      return { date, dateKey, weekdayIso: isoWeekday(date), isToday: dateKey === todayKey };
    });
  }, [currentDate, todayKey]);

  const lastSelectable = days.length - 1; // today; the window never includes the future
  const [selIndex, setSelIndex] = useState(lastSelectable);
  const safeIndex = Math.min(Math.max(0, selIndex), lastSelectable);
  const selected = days[safeIndex];
  const { dateKey: selDateKey, weekdayIso: selWeekdayIso, isToday: selIsToday } = selected;

  // ---- load earlier weeks' stored data so the whole window is data-backed ----
  const weekKeys = useMemo(
    () => Array.from(new Set(days.map((day) => weekKeyOf(day.dateKey)))).join(","),
    [days]
  );
  const [loaded, setLoaded] = useState<{
    sync: Record<string, SyncResult>;
    review: Record<string, BitbucketReviewSyncResult>;
  }>({ sync: {}, review: {} });

  useEffect(() => {
    let cancelled = false;
    const keys = weekKeys.split(",").filter(Boolean);
    void (async () => {
      const sync: Record<string, SyncResult> = {};
      const review: Record<string, BitbucketReviewSyncResult> = {};
      await Promise.all(
        keys.map(async (key) => {
          const [s, r] = await Promise.all([getSyncResult(key), getBitbucketReviewResult(key)]);
          if (s) sync[key] = s;
          if (r) review[key] = r;
        })
      );
      if (!cancelled) {
        setLoaded({ sync, review });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekKeys]);

  const targetMinutes = Math.max(0, Math.round(dailyTargetHours * 60));

  const coreDay = useMemo<ReconstructDay>(() => {
    const weekKey = weekKeyOf(selDateKey);
    const sync = syncResult?.weekKey === weekKey ? syncResult : loaded.sync[weekKey];
    const review = reviewResult?.weekKey === weekKey ? reviewResult : loaded.review[weekKey];

    const worklogs: ReconstructWorklog[] = (sync?.daySummaries?.[selDateKey]?.worklogs ?? []).map((w) => ({
      issueKey: w.issueKey,
      issueSummary: w.issueSummary,
      startedISO: w.started,
      timeSpentSeconds: w.timeSpentSeconds,
      comment: w.comment
    }));
    const reviewSessions: ReconstructReviewSession[] = (review?.sessions ?? [])
      .filter((session) => session.dateKey === selDateKey)
      .map((session) => ({
        id: session.id,
        jiraIssueKey: session.jiraIssueKey,
        pullRequestId: session.pullRequestId,
        pullRequestTitle: session.pullRequestTitle,
        repositoryName: session.repositoryName,
        startedISO: session.startedISO,
        endedISO: session.endedISO,
        estimatedSeconds: session.estimatedSeconds,
        commentCount: session.commentCount,
        confidence: session.confidence,
        logged: session.status === "logged",
        isPullRequestAuthor: session.isPullRequestAuthor
      }));
    const commits: ReconstructCommitGroup[] = (review?.commitGroups ?? [])
      .filter((group) => group.dateKey === selDateKey)
      .map((group) => ({
        id: group.id,
        jiraIssueKey: group.jiraIssueKey,
        pullRequestId: group.pullRequestId,
        branch: group.branch,
        repositoryName: group.repositoryName,
        primaryMessage: group.primaryMessage,
        commitCount: group.commitCount,
        firstCommitISO: group.firstCommitISO,
        lastCommitISO: group.lastCommitISO,
        estimatedSeconds: group.estimatedSeconds,
        confidence: group.confidence
      }));

    return buildReconstructDay({
      dateKey: selDateKey,
      weekdayIso: selWeekdayIso,
      isToday: selIsToday,
      workingDays: settings.workingDays,
      targetMinutes,
      worklogs,
      reviewSessions,
      commits
    });
  }, [loaded, reviewResult, selDateKey, selIsToday, selWeekdayIso, settings.workingDays, syncResult, targetMinutes]);

  // ---- rule-based auto-distribute (core, no model) --------------------------
  const [distributedKey, setDistributedKey] = useState<string | undefined>();
  const distribute = useCallback(() => setDistributedKey(selDateKey), [selDateKey]);
  const distributed = distributedKey === selDateKey;

  // ---- optional local-AI enhancement (off by default, never required) -------
  const [aiActive, setAiActive] = useState(false);
  const [enhanced, setEnhanced] = useState<{ dateKey: string; day: ReconstructDay } | undefined>();
  const [isEnhancing, setIsEnhancing] = useState(false);

  const aiConnection = useMemo(
    () => ({ endpoint: settings.ollamaEndpoint, model: settings.ollamaModel }),
    [settings.ollamaEndpoint, settings.ollamaModel]
  );

  const runEnhance = useCallback(
    async (day: ReconstructDay, shouldApply: () => boolean) => {
      const status = await probeOllama(aiConnection);
      if (!shouldApply()) return;
      setAiActive(status.reachable && status.modelReady);
      if (status.reachable && status.modelReady) {
        const result = await enhanceReconstructDay(day, aiConnection);
        if (shouldApply()) setEnhanced({ dateKey: day.dateKey, day: result });
      } else {
        setEnhanced({ dateKey: day.dateKey, day });
      }
    },
    [aiConnection]
  );

  useEffect(() => {
    if (!settings.aiEnabled) {
      setAiActive(false);
      setEnhanced(undefined);
      setIsEnhancing(false);
      return;
    }

    let cancelled = false;
    setIsEnhancing(true);
    void runEnhance(coreDay, () => !cancelled).finally(() => {
      if (!cancelled) setIsEnhancing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [coreDay, runEnhance, settings.aiEnabled]);

  const refreshAi = useCallback(() => {
    if (!settings.aiEnabled) return;
    setIsEnhancing(true);
    void runEnhance(coreDay, () => true).finally(() => setIsEnhancing(false));
  }, [coreDay, runEnhance, settings.aiEnabled]);

  const aiOn = settings.aiEnabled && aiActive;

  const day = useMemo<ReconstructDay>(() => {
    if (aiOn && enhanced?.dateKey === coreDay.dateKey) {
      return enhanced.day;
    }
    if (distributed) {
      return autoDistribute(coreDay);
    }
    return coreDay;
  }, [aiOn, coreDay, distributed, enhanced]);

  return {
    day,
    summary: getReconstructSummary(day),
    dateLabels: buildDateLabels(selected.date),
    aiOn,
    aiModel: settings.ollamaModel,
    isEnhancing,
    canStepBack: safeIndex > 0,
    canStepForward: safeIndex < lastSelectable,
    stepBack: () => setSelIndex((index) => Math.max(0, Math.min(index, lastSelectable) - 1)),
    stepForward: () => setSelIndex((index) => Math.min(lastSelectable, index + 1)),
    refreshAi,
    distribute,
    selectedDate: selected.date
  };
};
