import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  RecapDetail,
  RecapDraftRecord,
  RecapDraftVersion,
  RecapFormat,
  RecapFormatCopy,
  RecapInterval,
  RecapNarrativeFormat,
  RecapPeriod,
  RecapSourceItem,
  RecapTheme,
  RecurringEntry,
  RecurringEvent,
  SavedRecap
} from "../../shared/types";
import { enhanceRecapWorkspace } from "../api/ollama";
import {
  buildDeterministicRecap,
  carryRecapUserImpacts,
  RECAP_SCHEMA_VERSION,
  recapIntervalForDate,
  recapIntervalFromKey,
  recapIntervalParam,
  recapNarrativeCopy,
  recapRecordHasCurrentSchema,
  recapWeekKeys,
  shiftRecapInterval,
  type RecapEvidenceInput
} from "../domain/recapWorkspace";
import {
  getBitbucketReviewResult,
  getJiraActivityResult,
  getPersonalNotes,
  getRecapDraft,
  getReconstructDraft,
  getRecurringOccurrences,
  getSavedRecaps,
  getSyncResult,
  saveRecapDraft,
  saveSavedRecap
} from "../storage/db";
import { addDays, fromLocalDateKey, toLocalDateKey } from "../utils/date";
import { useAiConnection } from "./useAiConnection";

const PREF_KEY = "yesterlog-recap-preferences";
const FORMATS: RecapFormat[] = ["perf", "manager", "cv", "changelog"];
const DETAILS: RecapDetail[] = ["headline", "balanced", "detailed"];
const PERIODS: RecapPeriod[] = ["week", "month", "quarter"];
type RecapOperation = "refreshing" | "rewriting";
interface SavedRecapReturnState {
  period: RecapPeriod;
  interval: RecapInterval;
}
const isRecapFormat = (value: unknown): value is RecapFormat =>
  typeof value === "string" && FORMATS.includes(value as RecapFormat);

const sourceFingerprint = (source: RecapSourceItem) => JSON.stringify({
  kind: source.kind,
  dateKey: source.dateKey,
  title: source.title,
  seconds: source.timeSpentSeconds,
  issueKey: source.issueKey,
  epicKey: source.epicKey,
  epicSummary: source.epicSummary,
  projectKey: source.projectKey,
  projectName: source.projectName,
  components: [...(source.components ?? [])].sort(),
  repository: source.repository,
  pullRequestId: source.pullRequestId,
  role: source.role,
  status: source.status,
  details: [...(source.details ?? [])].sort(),
  dateKeys: [...(source.dateKeys ?? [])].sort()
});

const evidenceChangeCount = (current: RecapDraftVersion, latest: RecapDraftVersion) => {
  const currentSources = new Map(current.sources.map((source) => [source.id, sourceFingerprint(source)]));
  const latestSources = new Map(latest.sources.map((source) => [source.id, sourceFingerprint(source)]));
  const ids = new Set([...currentSources.keys(), ...latestSources.keys()]);
  const changedSources = [...ids].filter((id) => currentSources.get(id) !== latestSources.get(id)).length;
  const coverageChanged = JSON.stringify(current.coverage) !== JSON.stringify(latest.coverage);
  return Math.max(changedSources, coverageChanged ? 1 : 0);
};

const routeParams = () => {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#/recap")) return new URLSearchParams();
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
};

const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as { format?: unknown; detail?: unknown };
  } catch {
    return {};
  }
};

interface UseRecapWorkspaceOptions {
  currentDate: Date;
  settings: AppSettings;
  recurringEvents: RecurringEvent[];
  isDemo: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  demoEvidence?: Pick<RecapEvidenceInput, "syncResults" | "reviewResults" | "activityResults" | "personalNotes">;
  seedSavedRecaps?: SavedRecap[];
  onSavedRecap?: (saved: SavedRecap) => void;
}

const confirmedRecurring = (
  events: RecurringEvent[],
  occurrences: Awaited<ReturnType<typeof getRecurringOccurrences>>
): RecurringEntry[] => occurrences.flatMap((occurrence) => {
  if (occurrence.status !== "confirmed") return [];
  const event = events.find((candidate) => candidate.id === occurrence.eventId);
  if (!event) return [];
  return [{
    eventId: event.id,
    dateKey: occurrence.dateKey,
    title: event.title,
    localTime: occurrence.localTime ?? event.localTime,
    timeSpentSeconds: occurrence.timeSpentSeconds ?? event.durationMinutes * 60,
    note: occurrence.note ?? event.defaultNote
  }];
});

export const useRecapWorkspace = ({ currentDate, settings, recurringEvents, isDemo, onSuccess, onError, demoEvidence, seedSavedRecaps, onSavedRecap }: UseRecapWorkspaceOptions) => {
  const currentDateMs = currentDate.getTime();
  const initialParams = useMemo(routeParams, []);
  const prefs = useMemo(readPrefs, []);
  const initialPeriod = PERIODS.includes(initialParams.get("period") as RecapPeriod)
    ? initialParams.get("period") as RecapPeriod
    : "quarter";
  const [period, setPeriodState] = useState<RecapPeriod>(initialPeriod);
  const [format, setFormatState] = useState<RecapFormat>(isRecapFormat(initialParams.get("format"))
    ? initialParams.get("format") as RecapFormat : isRecapFormat(prefs.format) ? prefs.format : "perf");
  const [detail, setDetailState] = useState<RecapDetail>(DETAILS.includes(initialParams.get("detail") as RecapDetail)
    ? initialParams.get("detail") as RecapDetail
    : DETAILS.includes(prefs.detail as RecapDetail) ? prefs.detail as RecapDetail : "detailed");
  const initialInterval = recapIntervalFromKey(initialPeriod, initialParams.get("interval") ?? "", currentDate);
  const [intervals, setIntervals] = useState<Record<RecapPeriod, RecapInterval>>({
    week: initialPeriod === "week" ? initialInterval : recapIntervalForDate("week", currentDate),
    month: initialPeriod === "month" ? initialInterval : recapIntervalForDate("month", currentDate),
    quarter: initialPeriod === "quarter" ? initialInterval : recapIntervalForDate("quarter", currentDate)
  });
  const interval = intervals[period];
  const [record, setRecord] = useState<RecapDraftRecord>();
  const recordRef = useRef<RecapDraftRecord>();
  recordRef.current = record;
  const [saved, setSaved] = useState<SavedRecap[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | undefined>(initialParams.get("saved") ?? undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [operation, setOperation] = useState<RecapOperation>();
  const [newEvidenceCount, setNewEvidenceCount] = useState(0);
  const requestRef = useRef(0);
  const savedReturnRef = useRef<SavedRecapReturnState>();
  const demoHistorySeededRef = useRef(false);
  const aiConnection = useAiConnection(settings);

  const activeDraft = useMemo(() => record?.versions.find((version) => version.version === record.activeVersion), [record]);
  const selectedSaved = saved.find((item) => item.id === selectedSavedId);
  const displayedDraft = selectedSaved?.version ?? activeDraft;
  const isGenerating = Boolean(operation);

  useEffect(() => {
    if (!selectedSaved) return;
    const savedInterval = selectedSaved.version.interval;
    setPeriodState(savedInterval.period);
    setIntervals((current) => ({ ...current, [savedInterval.period]: savedInterval }));
  }, [selectedSaved]);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ format, detail })); } catch { /* restricted preview */ }
  }, [detail, format]);

  useEffect(() => {
    const query = new URLSearchParams({ period, interval: recapIntervalParam(interval), format, detail });
    if (selectedSavedId) query.set("saved", selectedSavedId);
    window.history.replaceState(null, "", `#/recap?${query}`);
  }, [detail, format, interval, period, selectedSavedId]);

  useEffect(() => {
    if (isDemo) {
      setSaved((current) => {
        const byId = new Map([...current, ...(seedSavedRecaps ?? [])].map((item) => [item.id, item]));
        return [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      });
      return;
    }
    let cancelled = false;
    void getSavedRecaps().then((items) => {
      if (!cancelled) setSaved(items.filter((item) => isRecapFormat(item.format)));
    }).catch(() => onError("Unable to load saved recaps."));
    return () => { cancelled = true; };
  }, [isDemo, onError, seedSavedRecaps]);

  useEffect(() => {
    if (!isDemo || !activeDraft || demoHistorySeededRef.current) return;
    demoHistorySeededRef.current = true;
    const currentQuarter = recapIntervalForDate("quarter", currentDate);
    const formats: RecapFormat[] = ["perf", "manager", "cv", "changelog"];
    const details: RecapDetail[] = ["detailed", "balanced", "detailed", "headline"];
    const history = formats.map((fixtureFormat, index): SavedRecap => {
      const fixtureInterval = shiftRecapInterval(currentQuarter, -(index + 1));
      return {
        id: `demo-history-${fixtureInterval.key.replace(":", "-")}`,
        savedAt: `${addDays(fromLocalDateKey(fixtureInterval.endDateKeyExclusive), -1).toISOString().slice(0, 10)}T17:00:00.000Z`,
        format: fixtureFormat,
        detail: details[index],
        version: {
          ...structuredClone(activeDraft),
          version: 1,
          interval: fixtureInterval,
          generatedAt: `${fixtureInterval.endDateKeyExclusive}T09:00:00.000Z`
        }
      };
    });
    setSaved((current) => [...current, ...history].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  }, [activeDraft, currentDate, isDemo]);

  const loadEvidence = useCallback(async (target: RecapInterval): Promise<RecapEvidenceInput> => {
    if (isDemo && demoEvidence) {
      return {
        interval: target,
        ...demoEvidence,
        recurringEntries: [],
        reconstructDrafts: {}
      };
    }
    const weekKeys = recapWeekKeys(target);
    const loaded = await Promise.all(weekKeys.map(async (weekKey) => {
      const [sync, activity, review, notes, occurrences] = await Promise.all([
        getSyncResult(weekKey), getJiraActivityResult(weekKey), getBitbucketReviewResult(weekKey),
        getPersonalNotes(weekKey), getRecurringOccurrences(weekKey)
      ]);
      return { sync, activity, review, notes, occurrences };
    }));
    const drafts: RecapEvidenceInput["reconstructDrafts"] = {};
    let cursor = fromLocalDateKey(target.startDateKey);
    const end = fromLocalDateKey(target.endDateKeyExclusive);
    while (cursor < end) {
      const key = toLocalDateKey(cursor);
      drafts[key] = await getReconstructDraft(key);
      cursor = addDays(cursor, 1);
    }
    return {
      interval: target,
      syncResults: loaded.flatMap((item) => item.sync ? [item.sync] : []),
      activityResults: loaded.flatMap((item) => item.activity ? [item.activity] : []),
      reviewResults: loaded.flatMap((item) => item.review ? [item.review] : []),
      personalNotes: loaded.flatMap((item) => item.notes),
      recurringEntries: loaded.flatMap((item) => confirmedRecurring(recurringEvents, item.occurrences)),
      reconstructDrafts: drafts
    };
  }, [demoEvidence, isDemo, recurringEvents]);
  const loadEvidenceRef = useRef(loadEvidence);
  const onErrorRef = useRef(onError);
  loadEvidenceRef.current = loadEvidence;
  onErrorRef.current = onError;

  useEffect(() => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setOperation(undefined);
    void Promise.all([loadEvidenceRef.current(interval), isDemo ? Promise.resolve(undefined) : getRecapDraft(interval.key)]).then(([nextEvidence, stored]) => {
      if (request !== requestRef.current) return;
      const storedActive = stored?.versions.find((version) => version.version === stored.activeVersion);
      if (stored?.versions.length && storedActive && recapRecordHasCurrentSchema(stored)) {
        setRecord(stored);
        setNewEvidenceCount(evidenceChangeCount(storedActive, buildDeterministicRecap(nextEvidence, storedActive.version, new Date(currentDateMs))));
        setIsLoading(false);
        return;
      }
      const version = stored?.versions.length ? Math.max(...stored.versions.map((item) => item.version)) + 1 : 1;
      const first = carryRecapUserImpacts(storedActive, buildDeterministicRecap(nextEvidence, version, new Date(currentDateMs)));
      const created = {
        intervalKey: interval.key,
        activeVersion: version,
        versions: [...(stored?.versions ?? []), first]
      };
      setRecord(created);
      setNewEvidenceCount(0);
      setIsLoading(false);
      if (!isDemo) void saveRecapDraft(created).catch(() => onErrorRef.current("Unable to save the recap draft."));
    }).catch((error) => {
      console.error(error);
      if (request === requestRef.current) {
        setOperation(undefined);
        setIsLoading(false);
        onErrorRef.current("Unable to build this recap from local history.");
      }
    });
  }, [currentDateMs, interval, isDemo]);

  const persistRecord = useCallback((next: RecapDraftRecord) => {
    recordRef.current = next;
    setRecord(next);
    if (!isDemo) void saveRecapDraft(next).catch(() => onError("Unable to save the recap draft."));
  }, [isDemo, onError]);

  const refreshActivity = useCallback(async () => {
    if (operation) return;
    const request = ++requestRef.current;
    const sourceVersion = activeDraft?.version;
    const sourceEditedAt = activeDraft?.editedAt;
    setOperation("refreshing");
    try {
      const nextEvidence = await loadEvidence(interval);
      if (request !== requestRef.current) return;
      const latest = recordRef.current;
      if (!latest || latest.intervalKey !== interval.key) return;
      const version = Math.max(0, ...latest.versions.map((item) => item.version)) + 1;
      const latestSource = latest.versions.find((item) => item.version === sourceVersion);
      const draft = carryRecapUserImpacts(latestSource, buildDeterministicRecap(nextEvidence, version, new Date(currentDateMs)));
      const sourceChangedWhileRefreshing = latestSource?.editedAt !== sourceEditedAt;
      const keepCurrentSelection = latest.activeVersion !== sourceVersion || sourceChangedWhileRefreshing;
      persistRecord({
        ...latest,
        activeVersion: keepCurrentSelection ? latest.activeVersion : version,
        versions: [...latest.versions, draft]
      });
      setNewEvidenceCount(0);
      onSuccess(`Refreshed from cached activity as version ${version}`);
    } catch (error) {
      console.error(error);
      if (request === requestRef.current) onError("Unable to refresh this recap from cached activity.");
    } finally {
      if (request === requestRef.current) setOperation(undefined);
    }
  }, [activeDraft, currentDateMs, interval, loadEvidence, onError, onSuccess, operation, persistRecord]);

  const rewriteWithAi = useCallback(async () => {
    if (!activeDraft || operation || !settings.aiEnabled || !activeDraft.themes.length) return;
    const request = ++requestRef.current;
    const sourceVersion = activeDraft.version;
    const sourceEditedAt = activeDraft.editedAt;
    const version = Math.max(0, ...(record?.versions.map((item) => item.version) ?? [])) + 1;
    const candidate = {
      ...structuredClone(activeDraft),
      version,
      generatedAt: new Date().toISOString(),
      editedAt: undefined
    };
    setOperation("rewriting");
    const enhanced = await enhanceRecapWorkspace(candidate, aiConnection, format, detail);
    if (request !== requestRef.current) return;
    if (!enhanced.aiFormats?.includes(format)) {
      onError("AI could not produce a grounded recap. Kept the current version unchanged.");
      setOperation(undefined);
      return;
    }
    const latest = recordRef.current;
    if (!latest || latest.intervalKey !== interval.key) {
      setOperation(undefined);
      return;
    }
    const completedVersion = Math.max(0, ...latest.versions.map((item) => item.version)) + 1;
    const latestSource = latest.versions.find((item) => item.version === sourceVersion);
    const sourceChangedWhileWriting = latestSource?.editedAt !== sourceEditedAt;
    const keepCurrentSelection = latest.activeVersion !== sourceVersion || sourceChangedWhileWriting;
    persistRecord({
      ...latest,
      activeVersion: keepCurrentSelection ? latest.activeVersion : completedVersion,
      versions: [...latest.versions, { ...enhanced, version: completedVersion }]
    });
    onSuccess(`Created AI version ${completedVersion}`);
    setOperation(undefined);
  }, [activeDraft, aiConnection, detail, format, interval.key, onError, onSuccess, operation, persistRecord, record, settings.aiEnabled]);

  const updateTheme = useCallback((themeId: string, update: (theme: RecapTheme) => RecapTheme) => {
    if (!record || selectedSaved) return;
    const now = new Date().toISOString();
    persistRecord({ ...record, versions: record.versions.map((version) => version.version === record.activeVersion
      ? { ...version, editedAt: now, themes: version.themes.map((theme) => theme.id === themeId ? update(theme) : theme) }
      : version) });
  }, [persistRecord, record, selectedSaved]);

  const updateNarrative = useCallback((
    narrativeFormat: RecapNarrativeFormat,
    update: (copy: RecapFormatCopy) => RecapFormatCopy
  ) => {
    if (!record || selectedSaved) return;
    const now = new Date().toISOString();
    persistRecord({
      ...record,
      versions: record.versions.map((version) => version.version === record.activeVersion
        ? {
            ...version,
            editedAt: now,
            narratives: {
              ...version.narratives,
              [narrativeFormat]: update(recapNarrativeCopy(version, narrativeFormat))
            }
          }
        : version)
    });
  }, [persistRecord, record, selectedSaved]);

  const setActiveVersion = useCallback((version: number) => {
    if (record?.versions.some((item) => item.version === version)) persistRecord({ ...record, activeVersion: version });
  }, [persistRecord, record]);

  const saveCurrent = useCallback(async () => {
    if (!activeDraft) return;
    const item: SavedRecap = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), format, detail, version: structuredClone(activeDraft) };
    if (!isDemo) {
      try {
        await saveSavedRecap(item);
      } catch {
        onError("Unable to save this recap to your brag doc.");
        return;
      }
    }
    setSaved((current) => [item, ...current]);
    onSavedRecap?.(item);
    onSuccess("Saved to your brag doc");
  }, [activeDraft, detail, format, isDemo, onError, onSavedRecap, onSuccess]);

  const duplicateSaved = useCallback(() => {
    if (!selectedSaved || !record || record.intervalKey !== selectedSaved.version.interval.key) return;
    const version = Math.max(0, ...record.versions.map((item) => item.version)) + 1;
    const clone = { ...structuredClone(selectedSaved.version), version, generatedAt: new Date().toISOString(), editedAt: undefined };
    persistRecord({ ...record, activeVersion: version, versions: [...record.versions, clone] });
    savedReturnRef.current = undefined;
    setSelectedSavedId(undefined);
  }, [persistRecord, record, selectedSaved]);

  const selectSaved = useCallback((id: string) => {
    if (!selectedSavedId && !savedReturnRef.current) savedReturnRef.current = { period, interval };
    setSelectedSavedId(id);
  }, [interval, period, selectedSavedId]);

  const closeSaved = useCallback(() => {
    const returnState = savedReturnRef.current;
    savedReturnRef.current = undefined;
    setSelectedSavedId(undefined);
    if (!returnState) return;
    setPeriodState(returnState.period);
    setIntervals((current) => ({ ...current, [returnState.period]: returnState.interval }));
  }, []);

  const clearSaved = () => {
    savedReturnRef.current = undefined;
    setSelectedSavedId(undefined);
  };
  const setFormat = (value: RecapFormat) => { clearSaved(); setFormatState(value); };
  const setDetail = (value: RecapDetail) => { clearSaved(); setDetailState(value); };
  const setPeriod = (value: RecapPeriod) => { setPeriodState(value); clearSaved(); };
  const stepInterval = (amount: number) => {
    clearSaved();
    setIntervals((current) => ({ ...current, [period]: shiftRecapInterval(current[period], amount) }));
  };
  const canStepNext = shiftRecapInterval(interval, 1).startDateKey <= toLocalDateKey(currentDate);

  return {
    period, format: selectedSaved?.format ?? format, detail: selectedSaved?.detail ?? detail, interval,
    record, activeDraft, displayedDraft, selectedSaved, saved, isLoading, isGenerating,
    isRefreshing: operation === "refreshing", isRewriting: operation === "rewriting", newEvidenceCount, canStepNext,
    canEnhanceWithAi: settings.aiEnabled,
    setPeriod, setFormat, setDetail, stepInterval, refreshActivity, rewriteWithAi, updateTheme, updateNarrative, setActiveVersion,
    saveCurrent, duplicateSaved, selectSaved, closeSaved
  };
};
