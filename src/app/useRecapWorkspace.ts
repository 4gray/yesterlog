import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  RecapDetail,
  RecapDraftRecord,
  RecapDraftVersion,
  RecapFormat,
  RecapInterval,
  RecapPeriod,
  RecapTheme,
  RecurringEntry,
  RecurringEvent,
  SavedRecap
} from "../../shared/types";
import { enhanceRecapWorkspace } from "../api/ollama";
import {
  buildDeterministicRecap,
  recapIntervalForDate,
  recapIntervalFromKey,
  recapIntervalParam,
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

const PREF_KEY = "timebro-recap-preferences";
const FORMATS: RecapFormat[] = ["perf", "manager", "cv", "standup", "changelog"];
const DETAILS: RecapDetail[] = ["headline", "balanced", "detailed"];
const PERIODS: RecapPeriod[] = ["week", "month", "quarter"];

const routeParams = () => {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#/recap")) return new URLSearchParams();
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
};

const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as { format?: RecapFormat; detail?: RecapDetail };
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
  const initialParams = useMemo(routeParams, []);
  const prefs = useMemo(readPrefs, []);
  const initialPeriod = PERIODS.includes(initialParams.get("period") as RecapPeriod)
    ? initialParams.get("period") as RecapPeriod
    : "quarter";
  const [period, setPeriodState] = useState<RecapPeriod>(initialPeriod);
  const [format, setFormatState] = useState<RecapFormat>(FORMATS.includes(initialParams.get("format") as RecapFormat)
    ? initialParams.get("format") as RecapFormat : prefs.format ?? "perf");
  const [detail, setDetailState] = useState<RecapDetail>(DETAILS.includes(initialParams.get("detail") as RecapDetail)
    ? initialParams.get("detail") as RecapDetail : prefs.detail ?? "detailed");
  const initialInterval = recapIntervalFromKey(initialPeriod, initialParams.get("interval") ?? "", currentDate);
  const [intervals, setIntervals] = useState<Record<RecapPeriod, RecapInterval>>({
    week: initialPeriod === "week" ? initialInterval : recapIntervalForDate("week", currentDate),
    month: initialPeriod === "month" ? initialInterval : recapIntervalForDate("month", currentDate),
    quarter: initialPeriod === "quarter" ? initialInterval : recapIntervalForDate("quarter", currentDate)
  });
  const interval = intervals[period];
  const [record, setRecord] = useState<RecapDraftRecord>();
  const [evidence, setEvidence] = useState<RecapEvidenceInput>();
  const [saved, setSaved] = useState<SavedRecap[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | undefined>(initialParams.get("saved") ?? undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const requestRef = useRef(0);
  const demoHistorySeededRef = useRef(false);
  const aiConnection = useAiConnection(settings);

  const activeDraft = useMemo(() => record?.versions.find((version) => version.version === record.activeVersion), [record]);
  const selectedSaved = saved.find((item) => item.id === selectedSavedId);
  const displayedDraft = selectedSaved?.version ?? activeDraft;

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
    void getSavedRecaps().then((items) => { if (!cancelled) setSaved(items); }).catch(() => onError("Unable to load saved recaps."));
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

  useEffect(() => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setIsGenerating(false);
    void Promise.all([loadEvidence(interval), isDemo ? Promise.resolve(undefined) : getRecapDraft(interval.key)]).then(async ([nextEvidence, stored]) => {
      if (request !== requestRef.current) return;
      setEvidence(nextEvidence);
      if (stored?.versions.length) {
        setRecord(stored);
        setIsLoading(false);
        return;
      }
      const first = buildDeterministicRecap(nextEvidence, 1, currentDate);
      const created = { intervalKey: interval.key, activeVersion: 1, versions: [first] };
      setRecord(created);
      setIsLoading(false);
      if (!isDemo) void saveRecapDraft(created).catch(() => onError("Unable to save the recap draft."));
      if (!settings.aiEnabled || !first.themes.length) return;
      setIsGenerating(true);
      const enhanced = await enhanceRecapWorkspace(first, aiConnection);
      if (request !== requestRef.current) return;
      const completed = { ...created, versions: [enhanced] };
      setRecord(completed);
      if (!isDemo) void saveRecapDraft(completed).catch(() => onError("Unable to save the recap draft."));
      setIsGenerating(false);
    }).catch((error) => {
      console.error(error);
      if (request === requestRef.current) {
        setIsGenerating(false);
        setIsLoading(false);
        onError("Unable to build this recap from local history.");
      }
    });
  }, [aiConnection, currentDate, interval, isDemo, loadEvidence, onError, settings.aiEnabled]);

  const persistRecord = useCallback((next: RecapDraftRecord) => {
    setRecord(next);
    if (!isDemo) void saveRecapDraft(next).catch(() => onError("Unable to save the recap draft."));
  }, [isDemo, onError]);

  const regenerate = useCallback(async () => {
    if (!evidence || isGenerating) return;
    const request = ++requestRef.current;
    const version = Math.max(0, ...(record?.versions.map((item) => item.version) ?? [])) + 1;
    setIsGenerating(true);
    const draft = buildDeterministicRecap(evidence, version);
    const next = { intervalKey: interval.key, activeVersion: version, versions: [...(record?.versions ?? []), draft] };
    persistRecord(next);
    if (!settings.aiEnabled || !draft.themes.length) {
      setIsGenerating(false);
      return;
    }
    const enhanced = await enhanceRecapWorkspace(draft, aiConnection);
    if (request !== requestRef.current) return;
    persistRecord({ ...next, versions: next.versions.map((item) => item.version === version ? enhanced : item) });
    setIsGenerating(false);
  }, [aiConnection, evidence, interval.key, isGenerating, persistRecord, record, settings.aiEnabled]);

  const updateTheme = useCallback((themeId: string, update: (theme: RecapTheme) => RecapTheme) => {
    if (!record || selectedSaved) return;
    const now = new Date().toISOString();
    persistRecord({ ...record, versions: record.versions.map((version) => version.version === record.activeVersion
      ? { ...version, editedAt: now, themes: version.themes.map((theme) => theme.id === themeId ? update(theme) : theme) }
      : version) });
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
    setSelectedSavedId(undefined);
  }, [persistRecord, record, selectedSaved]);

  const setFormat = (value: RecapFormat) => { setSelectedSavedId(undefined); setFormatState(value); };
  const setDetail = (value: RecapDetail) => { setSelectedSavedId(undefined); setDetailState(value); };
  const setPeriod = (value: RecapPeriod) => { setPeriodState(value); setSelectedSavedId(undefined); };
  const stepInterval = (amount: number) => {
    setSelectedSavedId(undefined);
    setIntervals((current) => ({ ...current, [period]: shiftRecapInterval(current[period], amount) }));
  };
  const canStepNext = shiftRecapInterval(interval, 1).startDateKey <= toLocalDateKey(currentDate);

  return {
    period, format: selectedSaved?.format ?? format, detail: selectedSaved?.detail ?? detail, interval,
    record, activeDraft, displayedDraft, selectedSaved, saved, isLoading, isGenerating, canStepNext,
    setPeriod, setFormat, setDetail, stepInterval, regenerate, updateTheme, setActiveVersion,
    saveCurrent, duplicateSaved, selectSaved: setSelectedSavedId, closeSaved: () => setSelectedSavedId(undefined)
  };
};
