import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, BitbucketReviewSyncResult, SyncResult } from "../../shared/types";
import { computeAiDrafts, probeOllama } from "../api/ollama";
import { applyAiDrafts, type AiDrafts } from "../domain/enhancePrompt";
import type {
  PlacementMap,
  ReconstructCommitGroup,
  ReconstructDay,
  ReconstructReviewSession,
  ReconstructWorklog
} from "../domain/reconstruct";
import { autoDistribute, buildReconstructDay, getReconstructSummary } from "../domain/reconstruct";
import type { ReconstructDateLabels } from "../components/ReconstructView";
import {
  getBitbucketReviewResult,
  getReconstructAiDrafts,
  getReconstructDraft,
  getSyncResult,
  saveReconstructAiDrafts,
  saveReconstructDraft
} from "../storage/db";
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

const clampHour = (hour: number) => Math.min(17, Math.max(9, Math.round(hour)));

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
  // Hour-bucketed so today's view advances each hour without recomputing every minute.
  const nowMinutes = selIsToday ? currentDate.getHours() * 60 : undefined;

  // ---- per-day drag/drop placement draft (persisted) ------------------------
  // A day starts with everything unplaced (in the rail); the user drags or bulk-places.
  const [drafts, setDrafts] = useState<Record<string, PlacementMap>>({});
  const placements = drafts[selDateKey] ?? {};

  useEffect(() => {
    let cancelled = false;
    void getReconstructDraft(selDateKey).then((saved) => {
      if (!cancelled && saved) {
        setDrafts((current) => (current[selDateKey] ? current : { ...current, [selDateKey]: saved }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selDateKey]);

  // Functional update so rapid edits in one tick compose instead of clobbering.
  const mutatePlacements = useCallback(
    (fn: (prev: PlacementMap) => PlacementMap) => {
      setDrafts((current) => ({ ...current, [selDateKey]: fn(current[selDateKey] ?? {}) }));
    },
    [selDateKey]
  );

  // Persist the active day's draft whenever it changes.
  useEffect(() => {
    const draft = drafts[selDateKey];
    if (draft) {
      void saveReconstructDraft(selDateKey, draft);
    }
  }, [drafts, selDateKey]);

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

    return buildReconstructDay(
      {
        dateKey: selDateKey,
        weekdayIso: selWeekdayIso,
        isToday: selIsToday,
        workingDays: settings.workingDays,
        targetMinutes,
        worklogs,
        reviewSessions,
        commits,
        nowMinutes
      },
      placements
    );
  }, [
    loaded,
    nowMinutes,
    placements,
    reviewResult,
    selDateKey,
    selIsToday,
    selWeekdayIso,
    settings.workingDays,
    syncResult,
    targetMinutes
  ]);

  // ---- drag/drop placement handlers ----------------------------------------
  const placeSignal = useCallback(
    (signalId: string, hour: number) => {
      mutatePlacements((prev) => ({ ...prev, [signalId]: clampHour(hour) }));
    },
    [mutatePlacements]
  );
  const unplaceSignal = useCallback(
    (signalId: string) => {
      mutatePlacements((prev) => {
        const next = { ...prev };
        delete next[signalId];
        return next;
      });
    },
    [mutatePlacements]
  );
  const placeAllSignals = useCallback(() => {
    mutatePlacements((prev) => {
      const next = { ...prev };
      for (const signal of coreDay.signals) {
        if (signal.isMarker || signal.durationMinutes <= 0) {
          continue;
        }
        if (typeof next[signal.id] !== "number") {
          next[signal.id] = clampHour(signal.startHour);
        }
      }
      return next;
    });
  }, [coreDay.signals, mutatePlacements]);

  // ---- rule-based auto-distribute (core, no model) --------------------------
  const [distributedKey, setDistributedKey] = useState<string | undefined>();
  const distribute = useCallback(() => setDistributedKey(selDateKey), [selDateKey]);
  const distributed = distributedKey === selDateKey;

  // ---- optional local-AI enhancement (off by default, never required) -------
  // Drafts are signal-keyed, cached per day, and re-applied on top of any placement —
  // so dragging an entry does NOT re-run the model. Drafting happens once per day (on
  // entry, if uncached) or on the explicit "Auto-draft all" button.
  const [aiActive, setAiActive] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [aiDraftsByDay, setAiDraftsByDay] = useState<Record<string, AiDrafts>>({});
  const enhanceRunId = useRef(0);

  // Latest coreDay without making the AI effect depend on placement edits.
  const coreDayRef = useRef(coreDay);
  coreDayRef.current = coreDay;

  const aiConnection = useMemo(
    () => ({ endpoint: settings.ollamaEndpoint, model: settings.ollamaModel }),
    [settings.ollamaEndpoint, settings.ollamaModel]
  );

  const runDraft = useCallback(
    async (runId: number) => {
      const day = coreDayRef.current;
      const drafts = await computeAiDrafts(day, aiConnection);
      if (enhanceRunId.current !== runId) {
        return;
      }
      setAiDraftsByDay((current) => ({ ...current, [selDateKey]: drafts }));
      void saveReconstructAiDrafts(selDateKey, drafts);
    },
    [aiConnection, selDateKey]
  );

  // On day change / enable: probe, load cached drafts, and auto-draft once if none cached.
  useEffect(() => {
    if (!settings.aiEnabled) {
      setAiActive(false);
      setIsEnhancing(false);
      return;
    }
    let cancelled = false;
    const runId = ++enhanceRunId.current;
    setIsEnhancing(true);
    void (async () => {
      try {
        const [status, cached] = await Promise.all([probeOllama(aiConnection), getReconstructAiDrafts(selDateKey)]);
        if (cancelled || enhanceRunId.current !== runId) {
          return;
        }
        setAiActive(status.reachable && status.modelReady);
        if (cached) {
          setAiDraftsByDay((current) => (current[selDateKey] ? current : { ...current, [selDateKey]: cached }));
          return;
        }
        if (status.reachable && status.modelReady) {
          await runDraft(runId);
        }
      } finally {
        if (!cancelled && enhanceRunId.current === runId) {
          setIsEnhancing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiConnection, runDraft, selDateKey, settings.aiEnabled]);

  const refreshAi = useCallback(() => {
    if (!settings.aiEnabled) {
      return;
    }
    const runId = ++enhanceRunId.current;
    setIsEnhancing(true);
    void (async () => {
      try {
        const status = await probeOllama(aiConnection);
        if (enhanceRunId.current !== runId) {
          return;
        }
        setAiActive(status.reachable && status.modelReady);
        if (status.reachable && status.modelReady) {
          await runDraft(runId);
        }
      } finally {
        if (enhanceRunId.current === runId) {
          setIsEnhancing(false);
        }
      }
    })();
  }, [aiConnection, runDraft, settings.aiEnabled]);

  const stopAi = useCallback(() => {
    enhanceRunId.current += 1; // invalidate any in-flight run
    setIsEnhancing(false);
  }, []);

  const aiOn = settings.aiEnabled && aiActive;

  const day = useMemo<ReconstructDay>(() => {
    const base = distributed ? autoDistribute(coreDay) : coreDay;
    const drafts = aiDraftsByDay[selDateKey];
    return aiOn && drafts ? applyAiDrafts(base, drafts) : base;
  }, [aiDraftsByDay, aiOn, coreDay, distributed, selDateKey]);

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
    stopAi,
    distribute,
    placeSignal,
    unplaceSignal,
    placeAllSignals,
    selectedDate: selected.date
  };
};
