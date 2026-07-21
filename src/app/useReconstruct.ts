import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WorklogAllocationPreference,
  WeekdayNumber
} from "../../shared/types";
import { aiModelLabel, computeAiDrafts, probeOllama } from "../api/ollama";
import { useAiConnection } from "./useAiConnection";
import { applyAiDrafts, type AiDrafts } from "../domain/enhancePrompt";
import type { PlacementMap, ReconstructDay, ReconstructLocalEntry, ReconstructWorklog } from "../domain/reconstruct";
import { buildDayRecurring, indexOccurrences } from "../domain/recurring";
import {
  getWorklogDisplaySeconds,
  getWorklogDisplayStarted,
  projectWorklogsForWeek
} from "../domain/worklogAllocation";
import {
  autoDistribute,
  buildReconstructDay,
  getReconstructSummary,
  toReconstructCommitGroups,
  toReconstructJiraActivities,
  toReconstructReviewSessions
} from "../domain/reconstruct";
import type { ReconstructDateLabels } from "../components/ReconstructView";
import {
  getBitbucketReviewResult,
  getJiraActivityResult,
  getPersonalNotes,
  getRecurringOccurrences,
  getReconstructAiDrafts,
  getReconstructDraft,
  getSyncResult,
  saveReconstructAiDrafts,
  saveReconstructDraft
} from "../storage/db";
import { addDays, fromLocalDateKey, isoWeekday, startOfWeekMonday, toLocalDateKey } from "../utils/date";

/** Trailing days the stepper spans, ending today — the worklog sync/edit window. */
const WINDOW_DAYS = 14;
const EMPTY_ALLOCATION_PREFERENCES: WorklogAllocationPreference[] = [];
const EMPTY_SKIPPED_DATES: string[] = [];

interface UseReconstructOptions {
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

interface DayDraft {
  placements: PlacementMap;
  /** signalId → overridden duration in minutes. */
  durations: Record<string, number>;
}

const EMPTY_DRAFT: DayDraft = { placements: {}, durations: {} };

const DURATION_STEP = 15;

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
  jiraActivityResult,
  reviewResult,
  localWeekKey,
  personalNotes,
  recurringEvents,
  recurringOccurrences,
  allocationSkippedDates = EMPTY_SKIPPED_DATES,
  worklogAllocationPreferences = EMPTY_ALLOCATION_PREFERENCES,
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
    jiraActivity: Record<string, JiraActivitySyncResult>;
    review: Record<string, BitbucketReviewSyncResult>;
    personalNotes: Record<string, PersonalNote[]>;
    recurringOccurrences: Record<string, RecurringOccurrence[]>;
  }>({ sync: {}, jiraActivity: {}, review: {}, personalNotes: {}, recurringOccurrences: {} });

  useEffect(() => {
    let cancelled = false;
    const keys = weekKeys.split(",").filter(Boolean);
    void (async () => {
      const sync: Record<string, SyncResult> = {};
      const jiraActivity: Record<string, JiraActivitySyncResult> = {};
      const review: Record<string, BitbucketReviewSyncResult> = {};
      const personalNotes: Record<string, PersonalNote[]> = {};
      const recurringOccurrences: Record<string, RecurringOccurrence[]> = {};
      await Promise.all(
        keys.map(async (key) => {
          const [s, a, r, notes, occurrences] = await Promise.all([
            getSyncResult(key),
            getJiraActivityResult(key),
            getBitbucketReviewResult(key),
            getPersonalNotes(key),
            getRecurringOccurrences(key)
          ]);
          if (s) sync[key] = s;
          if (a) jiraActivity[key] = a;
          if (r) review[key] = r;
          personalNotes[key] = notes;
          recurringOccurrences[key] = occurrences;
        })
      );
      if (!cancelled) {
        setLoaded({ sync, jiraActivity, review, personalNotes, recurringOccurrences });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekKeys]);

  const targetMinutes = Math.max(0, Math.round(dailyTargetHours * 60));
  // Hour-bucketed so today's view advances each hour without recomputing every minute.
  const nowMinutes = selIsToday ? currentDate.getHours() * 60 : undefined;

  // ---- per-day drag/drop draft: placements + duration overrides (persisted) --
  // A day starts with everything unplaced (in the rail); the user drags or bulk-places,
  // and can fine-tune each entry's duration.
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const dayDraft = drafts[selDateKey] ?? EMPTY_DRAFT;
  const placements = dayDraft.placements;
  const durations = dayDraft.durations;

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
  const mutateDraft = useCallback(
    (fn: (prev: DayDraft) => DayDraft) => {
      setDrafts((current) => ({ ...current, [selDateKey]: fn(current[selDateKey] ?? EMPTY_DRAFT) }));
    },
    [selDateKey]
  );

  // Persist the active day's draft whenever it changes.
  useEffect(() => {
    const draft = drafts[selDateKey];
    if (draft) {
      void saveReconstructDraft(selDateKey, draft.placements, draft.durations);
    }
  }, [drafts, selDateKey]);

  const coreDay = useMemo<ReconstructDay>(() => {
    const weekKey = weekKeyOf(selDateKey);
    const sync =
      syncResult?.weekKey === weekKey
        ? syncResult
        : projectWorklogsForWeek(loaded.sync[weekKey], {
            settings,
            skippedDates: allocationSkippedDates,
            preferences: worklogAllocationPreferences,
            now: currentDate
          });
    const activity = jiraActivityResult?.weekKey === weekKey ? jiraActivityResult : loaded.jiraActivity[weekKey];
    const review = reviewResult?.weekKey === weekKey ? reviewResult : loaded.review[weekKey];
    const notesForWeek = weekKey === localWeekKey ? personalNotes : loaded.personalNotes[weekKey] ?? [];
    const occurrencesForWeek =
      weekKey === localWeekKey ? recurringOccurrences : loaded.recurringOccurrences[weekKey] ?? [];

    const worklogs: ReconstructWorklog[] = (sync?.daySummaries?.[selDateKey]?.worklogs ?? []).map((w) => ({
      issueKey: w.issueKey,
      issueSummary: w.issueSummary,
      startedISO: getWorklogDisplayStarted(w),
      timeSpentSeconds: getWorklogDisplaySeconds(w),
      comment: w.comment
    }));
    const reviewSessions = toReconstructReviewSessions(review?.sessions, selDateKey);
    const commits = toReconstructCommitGroups(review?.commitGroups, selDateKey);
    const jiraActivities = toReconstructJiraActivities(activity?.activities, selDateKey);
    const localNoteEntries: ReconstructLocalEntry[] = notesForWeek
      .filter((note) => note.dateKey === selDateKey)
      .map((note) => ({
        id: note.id,
        source: "personal-note",
        title: note.title?.trim() || note.text.trim() || "Private note",
        startedISO: note.startedISO,
        timeSpentSeconds: note.timeSpentSeconds,
        note: note.text
      }));
    const recurring = buildDayRecurring(
      recurringEvents,
      indexOccurrences(occurrencesForWeek),
      selDateKey,
      selWeekdayIso as WeekdayNumber,
      {
        isWorkingDay: settings.workingDays.includes(selWeekdayIso as WeekdayNumber),
        isPastOrToday: selDateKey <= todayKey
      }
    );
    const recurringEntries: ReconstructLocalEntry[] = recurring.entries.map((entry) => ({
      id: `recurring:${entry.eventId}:${entry.dateKey}`,
      source: "recurring",
      title: entry.title,
      startedISO: `${entry.dateKey}T${entry.localTime}:00`,
      timeSpentSeconds: entry.timeSpentSeconds,
      note: entry.note
    }));

    return buildReconstructDay(
      {
        dateKey: selDateKey,
        weekdayIso: selWeekdayIso,
        isToday: selIsToday,
        workingDays: settings.workingDays,
        targetMinutes,
        worklogs,
        localEntries: [...localNoteEntries, ...recurringEntries],
        reviewSessions,
        commits,
        jiraActivities,
        nowMinutes
      },
      placements,
      durations
    );
  }, [
    allocationSkippedDates,
    currentDate,
    durations,
    loaded,
    localWeekKey,
    jiraActivityResult,
    nowMinutes,
    placements,
    personalNotes,
    recurringEvents,
    recurringOccurrences,
    reviewResult,
    selDateKey,
    selIsToday,
    selWeekdayIso,
    settings.workingDays,
    settings.weeklyTargetHours,
    syncResult,
    targetMinutes,
    todayKey,
    worklogAllocationPreferences
  ]);

  // Latest coreDay without making callbacks/effects depend on placement edits.
  const coreDayRef = useRef(coreDay);
  coreDayRef.current = coreDay;

  // ---- drag/drop placement + duration handlers -----------------------------
  const placeSignal = useCallback(
    (signalId: string, hour: number) => {
      mutateDraft((prev) => ({ ...prev, placements: { ...prev.placements, [signalId]: clampHour(hour) } }));
    },
    [mutateDraft]
  );
  const unplaceSignal = useCallback(
    (signalId: string) => {
      mutateDraft((prev) => {
        const placements = { ...prev.placements };
        delete placements[signalId];
        return { ...prev, placements };
      });
    },
    [mutateDraft]
  );
  const placeAllSignals = useCallback(() => {
    mutateDraft((prev) => {
      const placements = { ...prev.placements };
      for (const signal of coreDayRef.current.signals) {
        if (signal.isMarker || signal.durationMinutes <= 0) {
          continue;
        }
        if (typeof placements[signal.id] !== "number") {
          placements[signal.id] = clampHour(signal.startHour);
        }
      }
      return { ...prev, placements };
    });
  }, [mutateDraft]);
  const adjustDuration = useCallback(
    (signalId: string, deltaMinutes: number) => {
      mutateDraft((prev) => {
        const signal = coreDayRef.current.signals.find((candidate) => candidate.id === signalId);
        const base = prev.durations[signalId] ?? signal?.durationMinutes ?? 60;
        const next = Math.max(DURATION_STEP, Math.round((base + deltaMinutes) / DURATION_STEP) * DURATION_STEP);
        return { ...prev, durations: { ...prev.durations, [signalId]: next } };
      });
    },
    [mutateDraft]
  );

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

  const aiConnection = useAiConnection(settings);

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
    aiProvider: settings.aiProvider ?? "ollama",
    aiModel: aiModelLabel(settings),
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
    adjustDuration,
    selectedDate: selected.date
  };
};
