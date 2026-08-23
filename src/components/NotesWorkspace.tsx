import {
  Archive,
  ChevronsRight,
  FileText,
  GitPullRequest,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  Sparkles
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import type {
  AppSettings,
  BitbucketPullRequestDetailsResult,
  BitbucketReviewSyncResult,
  JiraIssueDetails,
  JiraTicket,
  SyncResult,
  TicketsResult
} from "../../shared/types";
import { useAiConnection } from "../app/useAiConnection";
import { computeNotesBriefing } from "../api/ollama";
import { nativeApi } from "../api/native";
import type { NotesBriefingSuggestion } from "../domain/notesBriefing";
import {
  GENERAL_NOTES_CONTAINER_ID,
  addWorkspaceNote,
  countOpenWorkspaceTodos,
  deleteWorkspaceNote,
  getScopedNoteTicketActivity,
  getVisibleWorkspaceNotes,
  getWorkspaceNoteCounts,
  getWorkspaceNoteProgress,
  isGlobalWorkspaceNoteContainerId,
  isNotebookContainerId,
  markAllWorkspaceTodosDone,
  moveWorkspaceNote,
  notebookContainerId,
  parseWorkspaceNoteInput,
  setWorkspaceNoteArchived,
  setWorkspaceNoteDone,
  updateWorkspaceNoteDocument,
  updateWorkspaceNoteText,
  type NoteJiraSnapshot,
  type NoteNotebook,
  type NoteTicketActivity,
  type NoteTicketScope,
  type WorkspaceNote,
  type WorkspaceNoteBucket,
  type WorkspaceNoteDocument,
  type WorkspaceNoteFilter,
  type WorkspaceNoteJiraScope,
  type WorkspaceNoteType
} from "../domain/ticketNotes";
import {
  getBitbucketReviewResults,
  getNoteNotebooks,
  getNoteTicketActivity,
  getWorkspaceNoteJiraScope,
  getWorkspaceNoteBuckets,
  saveNoteNotebooks,
  saveWorkspaceNoteBucket,
  saveWorkspaceNoteBuckets
} from "../storage/db";
import { toLocalDateKey } from "../utils/date";
import {
  ScratchpadEditor,
  type ScratchpadEditorValue
} from "./ScratchpadEditor";
import { NotesAiPanel } from "./NotesAiPanel";
import { NotesList } from "./NotesList";
import { NotesNewNoteModal } from "./NotesNewNoteModal";
import { NotesPrPanel } from "./NotesPrPanel";
import { NotesRail } from "./NotesRail";
import type { TicketSearchHandler } from "./TicketPicker";

export interface NotesWorkspaceProps {
  settings: AppSettings;
  currentDate: Date;
  isDemo: boolean;
  ticketOptions: JiraTicket[];
  tickets?: TicketsResult;
  syncResult?: SyncResult;
  reviewResult?: BitbucketReviewSyncResult;
  searchTickets: TicketSearchHandler;
  onError: (message: string) => void;
}

import {
  SCRATCHPAD_SAVE_DELAY_MS,
  TICKET_COLORS,
  accentForKey,
  formatDuration,
  formatNoteDate,
  formatRecency,
  issueTypeLabel,
  jiraOrigin,
  jiraSnapshotFromTicket,
  pullRequestTargetId,
  scratchpadDraftKey,
  uid,
  type BucketMap,
  type BriefingCacheEntry,
  type ContainerMeta,
  type GeneralNotesSurface,
  type LinkedPullRequest,
  type PullRequestCacheEntry,
  type ScratchpadDraft,
  type ScratchpadSaveState,
  type TargetOption
} from "./notesWorkspaceShared";
import { DEMO_BRIEFING, DEMO_PULL_REQUEST, makeDemoData } from "./notesWorkspaceDemo";

export const NotesWorkspace = ({
  settings,
  currentDate,
  isDemo,
  ticketOptions,
  tickets,
  syncResult,
  reviewResult,
  searchTickets,
  onError
}: NotesWorkspaceProps) => {
  const [buckets, setBuckets] = useState<BucketMap>({});
  const [notebooks, setNotebooks] = useState<NoteNotebook[]>([]);
  const [storedActivity, setStoredActivity] = useState<NoteTicketActivity[]>([]);
  const [reviewHistory, setReviewHistory] = useState<BitbucketReviewSyncResult[]>([]);
  const [jiraNoteScope, setJiraNoteScope] = useState<WorkspaceNoteJiraScope>();
  const [loadedNotesContextKey, setLoadedNotesContextKey] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedContainer, setSelectedContainer] = useState(GENERAL_NOTES_CONTAINER_ID);
  const [generalSurface, setGeneralSurface] = useState<GeneralNotesSurface>("scratchpad");
  const [scratchpadText, setScratchpadText] = useState("");
  const [scratchpadEditorState, setScratchpadEditorState] = useState<string>();
  const [scratchpadPlainText, setScratchpadPlainText] = useState("");
  const [scratchpadSaveState, setScratchpadSaveState] =
    useState<ScratchpadSaveState>("saved");
  const [scope, setScope] = useState<NoteTicketScope>("today");
  const [typeFilter, setTypeFilter] = useState<WorkspaceNoteFilter>("all");
  const [showArchive, setShowArchive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notebookAdding, setNotebookAdding] = useState(false);
  const [notebookName, setNotebookName] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerTodo, setComposerTodo] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string>();
  const [editingText, setEditingText] = useState("");
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteTodo, setNewNoteTodo] = useState(false);
  const [newNoteTarget, setNewNoteTarget] = useState(GENERAL_NOTES_CONTAINER_ID);
  const [newNoteTargetOption, setNewNoteTargetOption] = useState<TargetOption>();
  const [newNoteSearch, setNewNoteSearch] = useState("");
  const [searchResults, setSearchResults] = useState<JiraTicket[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [prCache, setPrCache] = useState<Record<string, PullRequestCacheEntry>>({});
  const [prOpen, setPrOpen] = useState<Record<string, boolean>>({});
  const [pendingPrTasks, setPendingPrTasks] = useState<Set<string>>(new Set());
  const [briefingCache, setBriefingCache] = useState<Record<string, BriefingCacheEntry>>({});
  const [briefingOpen, setBriefingOpen] = useState<Record<string, boolean>>({});

  const bucketsRef = useRef<BucketMap>({});
  const notebooksRef = useRef<NoteNotebook[]>([]);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const scratchpadDraftRef = useRef<ScratchpadDraft>({
    text: "",
    plainText: ""
  });
  const scratchpadSavedKeyRef = useRef(scratchpadDraftKey(scratchpadDraftRef.current));
  const scratchpadQueuedKeyRef = useRef(scratchpadDraftKey(scratchpadDraftRef.current));
  const scratchpadRevisionRef = useRef(0);
  const scratchpadSaveTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const flushScratchpadRef = useRef<() => void>(() => undefined);
  const jiraContextGenerationRef = useRef(0);
  const jiraDetailsPromisesRef = useRef(new Map<string, Promise<JiraIssueDetails | undefined>>());
  const prRequestTargetsRef = useRef(new Map<string, string>());
  const currentDateRef = useRef(currentDate);
  const onErrorRef = useRef(onError);
  const aiConnection = useAiConnection(settings);
  const notesContextKey = [
    settings.jiraBaseUrl.trim().toLowerCase(),
    settings.jiraEmail.trim().toLowerCase(),
    syncResult?.jiraSite ?? "",
    syncResult?.accountId ?? ""
  ].join("\u0000");
  const workspaceContextReady =
    isDemo ||
    (loadedNotesContextKey === notesContextKey && !isLoading && !loadError);
  currentDateRef.current = currentDate;
  onErrorRef.current = onError;

  const setBucketState = useCallback((next: BucketMap) => {
    bucketsRef.current = next;
    setBuckets(next);
  }, []);

  const enqueueMutation = useCallback(
    (mutation: () => Promise<void>) => {
      const pending = mutationQueueRef.current.then(mutation);
      mutationQueueRef.current = pending.catch((error) => {
        onError(error instanceof Error ? error.message : "Could not save local notes.");
      });
      return pending;
    },
    [onError]
  );

  const hydrateScratchpad = useCallback((document?: WorkspaceNoteDocument) => {
    if (scratchpadSaveTimerRef.current) {
      clearTimeout(scratchpadSaveTimerRef.current);
      scratchpadSaveTimerRef.current = undefined;
    }
    const draft: ScratchpadDraft = {
      text: document?.text ?? "",
      editorState: document?.editorState,
      plainText: document?.text ?? ""
    };
    const draftKey = scratchpadDraftKey(draft);
    scratchpadRevisionRef.current += 1;
    scratchpadDraftRef.current = draft;
    scratchpadSavedKeyRef.current = draftKey;
    scratchpadQueuedKeyRef.current = draftKey;
    setScratchpadText(draft.text);
    setScratchpadEditorState(draft.editorState);
    setScratchpadPlainText(draft.plainText);
    setScratchpadSaveState("saved");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        jiraContextGenerationRef.current += 1;
        setIsLoading(true);
        setLoadError(undefined);
        setBucketState({});
        setStoredActivity([]);
        setReviewHistory([]);
        setJiraNoteScope(undefined);
        setLoadedNotesContextKey(undefined);
        setSelectedContainer(GENERAL_NOTES_CONTAINER_ID);
        setGeneralSurface("scratchpad");
        hydrateScratchpad();
        setTypeFilter("all");
        setShowArchive(false);
        setComposerText("");
        setComposerTodo(false);
        setEditingNoteId(undefined);
        setEditingText("");
        setNewNoteOpen(false);
        setNewNoteText("");
        setNewNoteTodo(false);
        setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
        setNewNoteTargetOption(undefined);
        setNewNoteSearch("");
        setSearchResults([]);
        setSearchLoading(false);
        setPrCache({});
        setPrOpen({});
        setPendingPrTasks(new Set());
        setBriefingCache({});
        setBriefingOpen({});
        jiraDetailsPromisesRef.current.clear();
        prRequestTargetsRef.current.clear();

        if (!isDemo) {
          await mutationQueueRef.current;
          if (cancelled) return;
        }

        if (isDemo) {
          const demo = makeDemoData(currentDateRef.current);
          if (cancelled) return;
          const nextBuckets = Object.fromEntries(
            demo.buckets.map((bucket) => [bucket.containerId, bucket])
          );
          setBucketState(nextBuckets);
          hydrateScratchpad(nextBuckets[GENERAL_NOTES_CONTAINER_ID]?.document);
          notebooksRef.current = demo.notebooks;
          setNotebooks(demo.notebooks);
          setStoredActivity(demo.activity);
          setSelectedContainer("TB-352");
          setPrCache({
            "TB-352": {
              status: "ready",
              targetId: pullRequestTargetId(DEMO_PULL_REQUEST),
              details: DEMO_PULL_REQUEST
            }
          });
          setLoadError(undefined);
          setIsLoading(false);
          return;
        }

        const loadedJiraScope = await getWorkspaceNoteJiraScope();
        if (cancelled) return;
        setJiraNoteScope(loadedJiraScope);
        const explicitJiraScope = loadedJiraScope ?? null;
        const [savedBuckets, savedNotebooks, activity, savedReviewHistory] =
          await Promise.allSettled([
            getWorkspaceNoteBuckets(explicitJiraScope),
            getNoteNotebooks(),
            getNoteTicketActivity(explicitJiraScope),
            getBitbucketReviewResults()
          ]);
        if (cancelled) return;

        if (savedBuckets.status === "fulfilled") {
          const nextBuckets = Object.fromEntries(
            savedBuckets.value.map((bucket) => [bucket.containerId, bucket])
          );
          setBucketState(nextBuckets);
          hydrateScratchpad(nextBuckets[GENERAL_NOTES_CONTAINER_ID]?.document);
        }
        if (savedNotebooks.status === "fulfilled") {
          notebooksRef.current = savedNotebooks.value;
          setNotebooks(savedNotebooks.value);
        }

        const criticalFailure =
          savedBuckets.status === "rejected"
            ? savedBuckets.reason
            : savedNotebooks.status === "rejected"
              ? savedNotebooks.reason
              : undefined;
        if (criticalFailure) {
          const message =
            criticalFailure instanceof Error
              ? criticalFailure.message
              : "Could not load local notes.";
          setLoadError(message);
          onErrorRef.current(message);
          return;
        }

        setLoadError(undefined);
        setLoadedNotesContextKey(notesContextKey);
        const nextActivity = activity.status === "fulfilled" ? activity.value : [];
        setStoredActivity(nextActivity);
        setReviewHistory(
          savedReviewHistory.status === "fulfilled" ? savedReviewHistory.value : []
        );
        const today = getScopedNoteTicketActivity(
          nextActivity,
          "today",
          currentDateRef.current
        );
        setSelectedContainer(today[0]?.key ?? GENERAL_NOTES_CONTAINER_ID);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Could not load local notes.";
          setLoadError(message);
          onErrorRef.current(message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      flushScratchpadRef.current();
    };
  }, [
    isDemo,
    hydrateScratchpad,
    loadAttempt,
    setBucketState,
    notesContextKey
  ]);

  const lastScopeRefreshRef = useRef(syncResult?.syncedAt);
  useEffect(() => {
    const syncedAt = syncResult?.syncedAt;
    if (
      isDemo ||
      !syncedAt ||
      lastScopeRefreshRef.current === syncedAt
    ) {
      return;
    }
    lastScopeRefreshRef.current = syncedAt;
    if (loadedNotesContextKey !== notesContextKey) {
      return;
    }

    let cancelled = false;
    void getWorkspaceNoteJiraScope()
      .then((nextScope) => {
        if (cancelled) return;
        const scopeChanged =
          nextScope?.jiraSite !== jiraNoteScope?.jiraSite ||
          nextScope?.authorAccountId !== jiraNoteScope?.authorAccountId;
        if (scopeChanged) {
          setLoadAttempt((current) => current + 1);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onError(
            error instanceof Error
              ? error.message
              : "Could not refresh the Jira notes account."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    isDemo,
    jiraNoteScope,
    loadedNotesContextKey,
    notesContextKey,
    onError,
    syncResult?.syncedAt
  ]);

  const lastActivityRefreshRef = useRef<string>();
  useEffect(() => {
    const syncedAt = syncResult?.syncedAt;
    if (
      !syncedAt ||
      isDemo ||
      !jiraNoteScope ||
      !workspaceContextReady
    ) {
      return;
    }
    const refreshKey = `${jiraNoteScope.jiraSite}|${jiraNoteScope.authorAccountId}|${syncedAt}`;
    if (lastActivityRefreshRef.current === refreshKey) return;
    lastActivityRefreshRef.current = refreshKey;
    let cancelled = false;
    void getNoteTicketActivity(jiraNoteScope)
      .then((nextActivity) => {
        if (!cancelled) setStoredActivity(nextActivity);
      })
      .catch((error) => {
        if (!cancelled) {
          onError(error instanceof Error ? error.message : "Could not refresh ticket activity.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    isDemo,
    jiraNoteScope,
    onError,
    syncResult?.syncedAt,
    workspaceContextReady
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  }, []);

  const scopedTicketOptions = useMemo(
    () =>
      isDemo
        ? ticketOptions
        : workspaceContextReady &&
            jiraNoteScope &&
            tickets?.accountId === jiraNoteScope.authorAccountId
          ? [
              ...(tickets.inProgress ?? []),
              ...(tickets.recentlyClosed ?? [])
            ].filter(
              (ticket) => jiraOrigin(ticket.url) === jiraNoteScope.jiraSite
            )
          : [],
    [isDemo, jiraNoteScope, ticketOptions, tickets, workspaceContextReady]
  );

  const allTicketMetadata = useMemo(() => {
    const map = new Map<string, NoteJiraSnapshot>();
    for (const bucket of Object.values(buckets)) {
      if (bucket.jira) map.set(bucket.jira.key.toUpperCase(), bucket.jira);
    }
    for (const ticket of scopedTicketOptions) {
      map.set(ticket.key.toUpperCase(), jiraSnapshotFromTicket(ticket));
    }
    return map;
  }, [buckets, scopedTicketOptions]);

  const activity = useMemo(() => {
    const map = new Map<string, NoteTicketActivity>(
      storedActivity.map((item) => [item.key.toUpperCase(), { ...item }])
    );
    const currentWorklogs = new Map<string, NoteTicketActivity>();
    const syncJiraSite =
      jiraOrigin(syncResult?.jiraSite) ??
      syncResult?.sourceWorklogs
        ?.map((worklog) => jiraOrigin(worklog.issueUrl))
        .find((site): site is string => Boolean(site));
    const sourceWorklogs =
      jiraNoteScope &&
      syncResult?.accountId === jiraNoteScope.authorAccountId &&
      syncJiraSite === jiraNoteScope.jiraSite
        ? syncResult.sourceWorklogs ?? []
        : [];

    for (const worklog of sourceWorklogs) {
      const key = worklog.issueKey.trim().toUpperCase();
      const current = currentWorklogs.get(key);
      const startedTime = Date.parse(worklog.started);
      const currentTime = current ? Date.parse(current.lastWorkedAt) : Number.NEGATIVE_INFINITY;
      const next: NoteTicketActivity = current ?? {
        key,
        summary: worklog.issueSummary,
        url: worklog.issueUrl,
        issueType: worklog.issueType,
        epic: worklog.epic,
        lastWorkedAt: worklog.started,
        loggedSeconds: 0
      };
      next.loggedSeconds += Math.max(0, worklog.timeSpentSeconds);
      if (Number.isFinite(startedTime) && startedTime >= currentTime) {
        next.summary = worklog.issueSummary;
        next.url = worklog.issueUrl;
        next.issueType = worklog.issueType;
        next.epic = worklog.epic;
        next.lastWorkedAt = worklog.started;
      }
      currentWorklogs.set(key, next);
    }

    for (const [key, current] of currentWorklogs) {
      const saved = map.get(key);
      const savedTime = saved ? Date.parse(saved.lastWorkedAt) : Number.NEGATIVE_INFINITY;
      const currentTime = Date.parse(current.lastWorkedAt);
      map.set(key, {
        ...(saved ?? current),
        ...(currentTime >= savedTime ? current : saved),
        loggedSeconds: Math.max(saved?.loggedSeconds ?? 0, current.loggedSeconds)
      });
    }

    for (const [key, item] of map) {
      const fresh = allTicketMetadata.get(key);
      if (fresh) map.set(key, { ...item, ...fresh, lastWorkedAt: item.lastWorkedAt, loggedSeconds: item.loggedSeconds });
    }
    return [...map.values()];
  }, [allTicketMetadata, jiraNoteScope, storedActivity, syncResult]);

  const scopedTickets = useMemo(
    () => getScopedNoteTicketActivity(activity, scope, currentDate),
    [activity, currentDate, scope]
  );
  const activityKeys = useMemo(
    () => new Set(activity.map((item) => item.key.toUpperCase())),
    [activity]
  );
  const linkedBuckets = useMemo(
    () =>
      Object.values(buckets)
        .filter(
          (bucket) =>
            Boolean(bucket.jira) &&
            !activityKeys.has(bucket.containerId.toUpperCase()) &&
            bucket.notes.length > 0
        )
        .sort((left, right) => left.containerId.localeCompare(right.containerId)),
    [activityKeys, buckets]
  );

  const selectedBucket: WorkspaceNoteBucket = buckets[selectedContainer] ?? {
    containerId: selectedContainer,
    jira: allTicketMetadata.get(selectedContainer.toUpperCase()),
    notes: []
  };

  const selectedActivity = activity.find(
    (item) => item.key.toUpperCase() === selectedContainer.toUpperCase()
  );
  const selectedNotebook = isNotebookContainerId(selectedContainer)
    ? notebooks.find((notebook) => notebookContainerId(notebook.id) === selectedContainer)
    : undefined;

  const selectedMeta = useMemo<ContainerMeta>(() => {
    if (selectedContainer === GENERAL_NOTES_CONTAINER_ID) {
      return {
        containerId: selectedContainer,
        idLabel: "",
        title: "General notes",
        nick: "General",
        color: "#9d9b95",
        statusLabel: "Local",
        statusKind: "scratchpad",
        metaLine: "not tied to a ticket",
        isNotebook: false,
        isGeneral: true
      };
    }
    if (selectedNotebook) {
      return {
        containerId: selectedContainer,
        idLabel: "",
        title: selectedNotebook.title,
        nick: selectedNotebook.title,
        color: "#9d9b95",
        statusLabel: "Notebook",
        statusKind: "notebook",
        metaLine: "not tied to a ticket",
        isNotebook: true,
        isGeneral: false
      };
    }

    const jira =
      allTicketMetadata.get(selectedContainer.toUpperCase()) ??
      selectedBucket.jira ??
      selectedActivity;
    const isDone = jira?.statusCategory === "done";
    const type = issueTypeLabel(jira);
    const statusLabel =
      type === "EPIC"
        ? "Epic"
        : type === "SUB-TASK"
          ? "Sub-task"
          : isDone
            ? "Done"
            : jira?.statusName || "In progress";
    const statusKind =
      type === "EPIC"
        ? "epic"
        : type === "SUB-TASK"
          ? "subtask"
          : isDone
            ? "done"
            : jira?.statusCategory === "new"
              ? "backlog"
              : "progress";
    return {
      containerId: selectedContainer,
      idLabel: jira?.key ?? selectedContainer,
      title: jira?.summary ?? selectedContainer,
      nick: jira?.key ?? selectedContainer,
      color: accentForKey(selectedContainer),
      statusLabel,
      statusKind,
      metaLine: selectedActivity
        ? `${formatDuration(selectedActivity.loggedSeconds)} logged · last worked ${formatRecency(selectedActivity.lastWorkedAt, currentDate)}`
        : `${type === "EPIC" ? "Epic" : type === "SUB-TASK" ? "Sub-task" : "Task"} · linked via search, no time tracked`,
      jira,
      activity: selectedActivity,
      isNotebook: false,
      isGeneral: false
    };
  }, [
    allTicketMetadata,
    currentDate,
    selectedActivity,
    selectedBucket.jira,
    selectedContainer,
    selectedNotebook
  ]);

  const mutateBucket = useCallback(
    (
      containerId: string,
      jira: NoteJiraSnapshot | undefined,
      mutation: (bucket: WorkspaceNoteBucket) => WorkspaceNoteBucket
    ) => {
      const current = bucketsRef.current[containerId] ?? {
        containerId,
        jira,
        notes: []
      };
      if (
        !isDemo &&
        !isGlobalWorkspaceNoteContainerId(containerId) &&
        !jiraNoteScope
      ) {
        onErrorRef.current(
          "Sync Jira once before saving ticket notes for this account."
        );
        return undefined;
      }
      const nextBucket = mutation({
        ...current,
        jira: jira ?? current.jira
      });
      const next = { ...bucketsRef.current, [containerId]: nextBucket };
      setBucketState(next);
      if (!isDemo) {
        const capturedScope = jiraNoteScope ?? null;
        enqueueMutation(() =>
          saveWorkspaceNoteBucket(nextBucket, capturedScope)
        );
      }
      return nextBucket;
    },
    [enqueueMutation, isDemo, jiraNoteScope, setBucketState]
  );

  const persistScratchpad = useCallback(
    (draft: ScratchpadDraft, revision: number) => {
      const draftKey = scratchpadDraftKey(draft);
      const current = bucketsRef.current[GENERAL_NOTES_CONTAINER_ID] ?? {
        containerId: GENERAL_NOTES_CONTAINER_ID,
        notes: []
      };
      const nextBucket = updateWorkspaceNoteDocument(
        current,
        draft.text,
        new Date().toISOString(),
        draft.editorState
      );
      scratchpadQueuedKeyRef.current = draftKey;
      setBucketState({
        ...bucketsRef.current,
        [GENERAL_NOTES_CONTAINER_ID]: nextBucket
      });

      if (isDemo) {
        scratchpadSavedKeyRef.current = draftKey;
        if (
          scratchpadRevisionRef.current === revision &&
          scratchpadDraftKey(scratchpadDraftRef.current) === draftKey
        ) {
          setScratchpadSaveState("saved");
        }
        return;
      }

      void enqueueMutation(() => saveWorkspaceNoteBucket(nextBucket, null))
        .then(() => {
          scratchpadSavedKeyRef.current = draftKey;
          if (
            scratchpadRevisionRef.current === revision &&
            scratchpadDraftKey(scratchpadDraftRef.current) === draftKey
          ) {
            setScratchpadSaveState("saved");
          }
        })
        .catch(() => {
          if (scratchpadQueuedKeyRef.current === draftKey) {
            scratchpadQueuedKeyRef.current = scratchpadSavedKeyRef.current;
          }
          if (
            scratchpadRevisionRef.current === revision &&
            scratchpadDraftKey(scratchpadDraftRef.current) === draftKey
          ) {
            setScratchpadSaveState("error");
          }
        });
    },
    [enqueueMutation, isDemo, setBucketState]
  );

  const scheduleScratchpadSave = useCallback(
    (value: ScratchpadEditorValue) => {
      const draft: ScratchpadDraft = value;
      const draftKey = scratchpadDraftKey(draft);
      scratchpadRevisionRef.current += 1;
      const revision = scratchpadRevisionRef.current;
      scratchpadDraftRef.current = draft;
      setScratchpadText(draft.text);
      setScratchpadEditorState(draft.editorState);
      setScratchpadPlainText(draft.plainText);

      if (scratchpadSaveTimerRef.current) {
        clearTimeout(scratchpadSaveTimerRef.current);
      }
      if (
        draftKey === scratchpadSavedKeyRef.current &&
        draftKey === scratchpadQueuedKeyRef.current
      ) {
        scratchpadSaveTimerRef.current = undefined;
        setScratchpadSaveState("saved");
        return;
      }

      setScratchpadSaveState("saving");
      scratchpadSaveTimerRef.current = setTimeout(() => {
        scratchpadSaveTimerRef.current = undefined;
        persistScratchpad(draft, revision);
      }, SCRATCHPAD_SAVE_DELAY_MS);
    },
    [persistScratchpad]
  );

  const flushScratchpad = useCallback(() => {
    if (scratchpadSaveTimerRef.current) {
      clearTimeout(scratchpadSaveTimerRef.current);
      scratchpadSaveTimerRef.current = undefined;
    }
    const draft = scratchpadDraftRef.current;
    const draftKey = scratchpadDraftKey(draft);
    if (
      draftKey === scratchpadSavedKeyRef.current &&
      draftKey === scratchpadQueuedKeyRef.current
    ) {
      setScratchpadSaveState("saved");
      return;
    }
    if (draftKey === scratchpadQueuedKeyRef.current) return;
    persistScratchpad(draft, scratchpadRevisionRef.current);
  }, [persistScratchpad]);

  flushScratchpadRef.current = flushScratchpad;

  const addNoteToContainer = useCallback(
    (
      containerId: string,
      value: string,
      defaultType: WorkspaceNoteType,
      jira?: NoteJiraSnapshot
    ) => {
      const parsed = parseWorkspaceNoteInput(value, defaultType);
      if (!parsed.text) return false;
      const timestamp = new Date().toISOString();
      const note: WorkspaceNote = {
        id: uid("note"),
        type: parsed.type,
        done: false,
        text: parsed.text,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return Boolean(
        mutateBucket(containerId, jira, (bucket) =>
          addWorkspaceNote(bucket, note)
        )
      );
    },
    [mutateBucket]
  );

  const chooseContainer = useCallback(
    (containerId: string) => {
      if (
        selectedContainer === GENERAL_NOTES_CONTAINER_ID &&
        generalSurface === "scratchpad"
      ) {
        flushScratchpad();
      }
      setSelectedContainer(containerId);
      setEditingNoteId(undefined);
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 760px)").matches
      ) {
        setSidebarOpen(false);
      }
    },
    [flushScratchpad, generalSurface, selectedContainer]
  );

  const createNotebook = () => {
    const title = notebookName.trim();
    if (!title) return;
    const timestamp = new Date().toISOString();
    const notebook: NoteNotebook = {
      id: uid("notebook"),
      title,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const next = [...notebooksRef.current, notebook];
    notebooksRef.current = next;
    setNotebooks(next);
    if (!isDemo) enqueueMutation(() => saveNoteNotebooks(next));
    setNotebookName("");
    setNotebookAdding(false);
    chooseContainer(notebookContainerId(notebook.id));
  };

  const openNewNote = () => {
    setNewNoteText("");
    setNewNoteTodo(false);
    setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
    setNewNoteTargetOption(undefined);
    setNewNoteSearch("");
    setSearchResults(scopedTicketOptions.slice(0, 4));
    setNewNoteOpen(true);
  };

  useEffect(() => {
    if (!newNoteOpen) return;
    const query = newNoteSearch.trim();
    if (query.length < 2) {
      const normalized = query.toLowerCase();
      setSearchResults(
        scopedTicketOptions
          .filter((ticket) =>
            !normalized
              ? true
              : `${ticket.key} ${ticket.summary}`.toLowerCase().includes(normalized)
          )
          .slice(0, 4)
      );
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timeout = window.setTimeout(() => {
      void searchTickets(query, "createdDesc", 4, false)
        .then((result) => {
          if (!cancelled) setSearchResults(result.slice(0, 4));
        })
        .catch((error) => {
          if (!cancelled) {
            setSearchResults([]);
            onError(error instanceof Error ? error.message : "Could not search Jira.");
          }
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [newNoteOpen, newNoteSearch, onError, scopedTicketOptions, searchTickets]);

  const targetOptions = useMemo<TargetOption[]>(() => {
    const query = newNoteSearch.trim().toLowerCase();
    const notebookTargets = notebooks
      .filter((notebook) => !query || notebook.title.toLowerCase().includes(query))
      .map((notebook) => ({
        containerId: notebookContainerId(notebook.id),
        label: notebook.title,
        typeLabel: "NOTEBOOK",
        color: "#9d9b95"
      }));
    const jiraTargets = searchResults
      .filter(
        (ticket) =>
          isDemo ||
          (jiraNoteScope &&
            jiraOrigin(ticket.url) === jiraNoteScope.jiraSite)
      )
      .map((ticket) => ({
        containerId: ticket.key.toUpperCase(),
        label: `${ticket.key.toUpperCase()} — ${ticket.summary}`,
        typeLabel: issueTypeLabel(jiraSnapshotFromTicket(ticket)),
        color: accentForKey(ticket.key),
        jira: jiraSnapshotFromTicket(ticket)
      }));
    const seen = new Set<string>();
    return [...notebookTargets, ...jiraTargets]
      .filter((target) => {
        if (target.containerId === newNoteTarget || seen.has(target.containerId)) return false;
        seen.add(target.containerId);
        return true;
      })
      .slice(0, 4);
  }, [
    isDemo,
    jiraNoteScope,
    newNoteSearch,
    newNoteTarget,
    notebooks,
    searchResults
  ]);

  const selectedTarget = useMemo<TargetOption>(() => {
    if (
      newNoteTargetOption &&
      newNoteTargetOption.containerId === newNoteTarget
    ) {
      return newNoteTargetOption;
    }
    if (newNoteTarget === GENERAL_NOTES_CONTAINER_ID) {
      return {
        containerId: GENERAL_NOTES_CONTAINER_ID,
        label: "General notes",
        typeLabel: "SCRATCHPAD",
        color: "#9d9b95"
      };
    }
    const notebook = notebooks.find(
      (candidate) => notebookContainerId(candidate.id) === newNoteTarget
    );
    if (notebook) {
      return {
        containerId: newNoteTarget,
        label: notebook.title,
        typeLabel: "NOTEBOOK",
        color: "#9d9b95"
      };
    }
    const jira =
      allTicketMetadata.get(newNoteTarget.toUpperCase()) ??
      searchResults
        .filter((ticket) => ticket.key.toUpperCase() === newNoteTarget.toUpperCase())
        .map(jiraSnapshotFromTicket)[0];
    return {
      containerId: newNoteTarget,
      label: jira ? `${jira.key} — ${jira.summary}` : newNoteTarget,
      typeLabel: issueTypeLabel(jira),
      color: accentForKey(newNoteTarget),
      jira
    };
  }, [
    allTicketMetadata,
    newNoteTarget,
    newNoteTargetOption,
    notebooks,
    searchResults
  ]);

  const saveNewNote = () => {
    if (
      !addNoteToContainer(
        selectedTarget.containerId,
        newNoteText,
        newNoteTodo ? "todo" : "text",
        selectedTarget.jira
      )
    ) {
      return;
    }
    setNewNoteOpen(false);
    setNewNoteText("");
    setNewNoteSearch("");
    setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
    setNewNoteTargetOption(undefined);
    setShowArchive(false);
    setTypeFilter("all");
    chooseContainer(selectedTarget.containerId);
  };

  const linkedPullRequest = useMemo<LinkedPullRequest | undefined>(() => {
    if (!selectedMeta.jira) return undefined;
    const jiraKey = selectedMeta.jira.key.toUpperCase();
    const results = [
      ...(reviewResult ? [reviewResult] : []),
      ...reviewHistory
    ].filter(
      (result, index, all) =>
        result.workspace === (settings.bitbucketWorkspace.trim() || result.workspace) &&
        all.findIndex(
          (candidate) =>
            candidate.weekKey === result.weekKey &&
            candidate.workspace === result.workspace
        ) === index
    );
    const references: LinkedPullRequest[] = [];

    for (const result of results) {
      for (const session of result.sessions) {
        if (session.jiraIssueKey?.trim().toUpperCase() !== jiraKey) continue;
        references.push({
          workspace: session.workspace,
          repositorySlug: session.repositorySlug,
          pullRequestId: session.pullRequestId,
          title: session.pullRequestTitle,
          url: session.pullRequestUrl,
          occurredAt: session.startedISO
        });
      }
      for (const group of result.commitGroups ?? []) {
        if (
          group.jiraIssueKey?.trim().toUpperCase() !== jiraKey ||
          !group.pullRequestId
        ) {
          continue;
        }
        references.push({
          workspace: group.workspace,
          repositorySlug: group.repositorySlug,
          pullRequestId: group.pullRequestId,
          title: group.primaryMessage,
          occurredAt: group.lastCommitISO
        });
      }
    }

    return references.sort(
      (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    )[0];
  }, [reviewHistory, reviewResult, selectedMeta.jira, settings.bitbucketWorkspace]);

  useEffect(() => {
    const key = selectedMeta.jira?.key.toUpperCase();
    if (!key || isDemo || !workspaceContextReady) return;
    if (!linkedPullRequest) {
      prRequestTargetsRef.current.delete(key);
      return;
    }
    const targetId = pullRequestTargetId(linkedPullRequest);
    const contextGeneration = jiraContextGenerationRef.current;
    prRequestTargetsRef.current.set(key, targetId);
    if (prCache[key]?.targetId === targetId) return;
    setPrCache((current) => ({
      ...current,
      [key]: { status: "loading", targetId }
    }));
    void nativeApi
      .fetchBitbucketPullRequestDetails({
        settings,
        workspace: linkedPullRequest.workspace,
        repositorySlug: linkedPullRequest.repositorySlug,
        pullRequestId: linkedPullRequest.pullRequestId
      })
      .then((details) => {
        if (jiraContextGenerationRef.current !== contextGeneration) return;
        setPrCache((current) =>
          current[key]?.targetId === targetId
            ? {
                ...current,
                [key]: { status: "ready", targetId, details }
              }
            : current
        );
      })
      .catch((error) => {
        if (jiraContextGenerationRef.current !== contextGeneration) return;
        setPrCache((current) =>
          current[key]?.targetId === targetId
            ? {
                ...current,
                [key]: { status: "error", targetId }
              }
            : current
        );
        if (prRequestTargetsRef.current.get(key) === targetId) {
          onError(
            error instanceof Error
              ? error.message
              : "Could not load Bitbucket pull request."
          );
        }
      });
  }, [
    isDemo,
    linkedPullRequest,
    onError,
    prCache,
    selectedMeta.jira,
    settings,
    workspaceContextReady
  ]);

  const selectedJiraKey = selectedMeta.jira?.key.toUpperCase();
  const selectedPrTargetId = linkedPullRequest
    ? pullRequestTargetId(linkedPullRequest)
    : isDemo && selectedJiraKey === "TB-352"
      ? pullRequestTargetId(DEMO_PULL_REQUEST)
      : undefined;
  const cachedPrEntry = selectedJiraKey ? prCache[selectedJiraKey] : undefined;
  const selectedPrEntry =
    cachedPrEntry?.targetId === selectedPrTargetId ? cachedPrEntry : undefined;
  const selectedPr = selectedPrEntry?.details;
  const prAvailable = Boolean(
    selectedMeta.jira &&
      (linkedPullRequest || (isDemo && selectedMeta.jira.key.toUpperCase() === "TB-352"))
  );

  const getJiraDetails = useCallback(
    (jira: NoteJiraSnapshot) => {
      const key = jira.key.toUpperCase();
      const existing = jiraDetailsPromisesRef.current.get(key);
      if (existing) return existing;
      const promise = isDemo
        ? Promise.resolve<JiraIssueDetails | undefined>({
            id: key,
            key,
            summary: jira.summary,
            projectKey: key.split("-")[0],
            projectName: "Yesterlog",
            statusName: jira.statusName ?? "In progress",
            statusCategory: jira.statusCategory ?? "indeterminate",
            loggedSecondsTotal: selectedActivity?.loggedSeconds ?? 0,
            url: jira.url ?? "",
            issueType: jira.issueType,
            epic: jira.epic,
            description: "Move session persistence to Redis while preserving the cookie fallback during rollout.",
            comments: [
              "Confirm the rollback path before production.",
              "Add metrics around the fallback path."
            ],
            myLoggedSecondsTotal: selectedActivity?.loggedSeconds ?? 0,
            myWorklogCount: 1
          })
        : nativeApi
            .fetchJiraIssueDetails({ settings, issueKey: key })
            .catch(() => undefined);
      jiraDetailsPromisesRef.current.set(key, promise);
      return promise;
    },
    [isDemo, selectedActivity?.loggedSeconds, settings]
  );

  const togglePrTask = async (taskId: number) => {
    if (!selectedPr || !selectedJiraKey) return;
    const contextGeneration = jiraContextGenerationRef.current;
    const task = selectedPr.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const targetId = pullRequestTargetId(selectedPr);
    const pendingKey = `${targetId}/${taskId}`;
    if (pendingPrTasks.has(pendingKey)) return;
    const nextResolved = !task.resolved;
    const optimisticTask = {
      ...task,
      resolved: nextResolved,
      state: nextResolved ? ("RESOLVED" as const) : ("UNRESOLVED" as const)
    };
    setPendingPrTasks((current) => new Set(current).add(pendingKey));
    setPrCache((current) =>
      current[selectedJiraKey]?.targetId === targetId
        ? {
            ...current,
            [selectedJiraKey]: {
              status: "ready",
              targetId,
              details: {
                ...selectedPr,
                tasks: selectedPr.tasks.map((candidate) =>
                  candidate.id === taskId ? optimisticTask : candidate
                )
              }
            }
          }
        : current
    );

    try {
      if (!isDemo) {
        const result = await nativeApi.setBitbucketPullRequestTaskState({
          settings,
          workspace: selectedPr.workspace,
          repositorySlug: selectedPr.repositorySlug,
          pullRequestId: selectedPr.pullRequestId,
          taskId,
          content: task.content,
          resolved: nextResolved
        });
        if (jiraContextGenerationRef.current !== contextGeneration) return;
        setPrCache((current) => {
          const entry = current[selectedJiraKey];
          const details = entry?.targetId === targetId ? entry.details : undefined;
          return details
            ? {
                ...current,
                [selectedJiraKey]: {
                  status: "ready",
                  targetId,
                  details: {
                    ...details,
                    tasks: details.tasks.map((candidate) =>
                      candidate.id === taskId ? result.task : candidate
                    )
                  }
                }
              }
            : current;
        });
      }
    } catch (error) {
      if (jiraContextGenerationRef.current !== contextGeneration) return;
      setPrCache((current) => {
        const entry = current[selectedJiraKey];
        const details = entry?.targetId === targetId ? entry.details : undefined;
        if (!details) return current;
        return {
          ...current,
          [selectedJiraKey]: {
            status: "ready",
            targetId,
            details: {
              ...details,
              tasks: details.tasks.map((candidate) =>
                candidate.id === taskId ? task : candidate
              )
            }
          }
        };
      });
      onError(error instanceof Error ? error.message : "Could not update Bitbucket task.");
    } finally {
      if (jiraContextGenerationRef.current === contextGeneration) {
        setPendingPrTasks((current) => {
          const next = new Set(current);
          next.delete(pendingKey);
          return next;
        });
      }
    }
  };

  const hasTodoText = useCallback(
    (text: string) =>
      selectedBucket.notes.some((note) => note.type === "todo" && note.text === text),
    [selectedBucket.notes]
  );

  const commentTodoText = (author: string, content: string) =>
    `${author.trim().split(/\s+/)[0] || "Reviewer"} on PR: ${content}`;

  const openBriefing = async () => {
    if (!selectedMeta.jira || !selectedJiraKey) return;
    const contextGeneration = jiraContextGenerationRef.current;
    const existing = briefingCache[selectedJiraKey];
    if (existing) {
      setBriefingOpen((current) => ({
        ...current,
        [selectedJiraKey]: !current[selectedJiraKey]
      }));
      return;
    }
    if (!settings.aiEnabled && !isDemo) {
      onError("Enable an AI provider in Settings to generate a briefing.");
      return;
    }

    setBriefingOpen((current) => ({ ...current, [selectedJiraKey]: true }));
    setBriefingCache((current) => ({
      ...current,
      [selectedJiraKey]: {
        status: "loading",
        suggestions: [],
        sourceLabel: selectedPr
          ? `description · Jira comments · PR #${selectedPr.pullRequestId}`
          : "description · Jira comments"
      }
    }));
    try {
      if (isDemo) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1300));
        if (jiraContextGenerationRef.current !== contextGeneration) return;
        setBriefingCache((current) => ({
          ...current,
          [selectedJiraKey]: {
            status: "ready",
            suggestions: DEMO_BRIEFING,
            sourceLabel: "description · Jira comments · PR #472"
          }
        }));
        return;
      }

      const details = await getJiraDetails(selectedMeta.jira);
      if (jiraContextGenerationRef.current !== contextGeneration) return;
      const suggestions = await computeNotesBriefing(
        {
          ticket: {
            key: selectedMeta.jira.key,
            summary: selectedMeta.jira.summary,
            description: details?.description,
            comments: details?.comments
          },
          ...(selectedPr
            ? {
                pullRequest: {
                  id: selectedPr.pullRequestId,
                  title: selectedPr.title,
                  diffstatSummary: selectedPr.diffstatSummary
                }
              }
            : {})
        },
        aiConnection
      );
      if (jiraContextGenerationRef.current !== contextGeneration) return;
      setBriefingCache((current) => ({
        ...current,
        [selectedJiraKey]: {
          status: "ready",
          suggestions,
          sourceLabel: [
            details?.description ? "description" : undefined,
            details?.comments?.length
              ? `${details.comments.length} Jira ${details.comments.length === 1 ? "comment" : "comments"}`
              : undefined,
            selectedPr?.diffstatSummary
              ? `PR #${selectedPr.pullRequestId} diffstat`
              : selectedPr
                ? `PR #${selectedPr.pullRequestId}`
                : undefined
          ]
            .filter(Boolean)
            .join(" · ") || "Jira ticket data"
        }
      }));
    } catch (error) {
      if (jiraContextGenerationRef.current !== contextGeneration) return;
      setBriefingCache((current) => ({
        ...current,
        [selectedJiraKey]: {
          status: "ready",
          suggestions: [],
          sourceLabel: "Jira ticket data"
        }
      }));
      onError(error instanceof Error ? error.message : "Could not generate an AI briefing.");
    }
  };

  const baseVisibleNotes = getVisibleWorkspaceNotes(selectedBucket.notes, {
    archived: showArchive
  });
  const visibleNotes = getVisibleWorkspaceNotes(selectedBucket.notes, {
    archived: showArchive,
    filter: typeFilter
  });
  const counts = getWorkspaceNoteCounts(selectedBucket.notes);
  const progress = getWorkspaceNoteProgress(selectedBucket.notes);
  const showScratchpad = selectedMeta.isGeneral && generalSurface === "scratchpad";
  const scratchpadWordCount = scratchpadPlainText.trim()
    ? scratchpadPlainText.trim().split(/\s+/).length
    : 0;
  const scratchpadLineCount = scratchpadPlainText
    ? scratchpadPlainText.split("\n").length
    : 0;
  const currentBriefing = selectedJiraKey ? briefingCache[selectedJiraKey] : undefined;
  const isPrOpen = selectedJiraKey ? Boolean(prOpen[selectedJiraKey]) : false;
  const isBriefingOpen = selectedJiraKey
    ? Boolean(briefingOpen[selectedJiraKey])
    : false;
  const selectedPrOpenItemCount = selectedPr
    ? selectedPr.tasks.filter((task) => !task.resolved).length + selectedPr.comments.length
    : 0;
  const selectedPrTasksForPanel =
    selectedPr?.state === "MERGED"
      ? selectedPr.tasks.filter((task) => !task.resolved)
      : selectedPr?.tasks ?? [];
  const selectedPrAllClear =
    selectedPr?.state === "MERGED" && selectedPrOpenItemCount === 0;

  const commitEdit = (noteId: string) => {
    const value = editingText.trim();
    if (value) {
      const timestamp = new Date().toISOString();
      mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
        updateWorkspaceNoteText(bucket, noteId, value, timestamp)
      );
    }
    setEditingNoteId(undefined);
    setEditingText("");
  };

  const editorStyle = {
    "--notes-accent": selectedMeta.color
  } as CSSProperties;

  const moveNoteToGeneral = (note: WorkspaceNote) => {
    const source = bucketsRef.current[selectedContainer] ?? selectedBucket;
    const target = bucketsRef.current[GENERAL_NOTES_CONTAINER_ID] ?? {
      containerId: GENERAL_NOTES_CONTAINER_ID,
      notes: []
    };
    if (!isDemo && !jiraNoteScope) {
      onErrorRef.current("Sync Jira once before saving ticket notes for this account.");
      return;
    }
    const moved = moveWorkspaceNote(source, target, note.id, new Date().toISOString());
    const next = {
      ...bucketsRef.current,
      [selectedContainer]: moved.source,
      [GENERAL_NOTES_CONTAINER_ID]: moved.target
    };
    setBucketState(next);
    if (!isDemo) {
      const capturedScope = jiraNoteScope ?? null;
      enqueueMutation(() => saveWorkspaceNoteBuckets([moved.source, moved.target], capturedScope));
    }
  };

  if (
    isLoading ||
    (!loadError &&
      !isDemo &&
      loadedNotesContextKey !== notesContextKey)
  ) {
    return (
      <section className="notes-workspace notes-workspace-loading" aria-label="Notes workspace">
        <LoaderCircle className="notes-spinner" size={18} />
        <span>Loading local notes…</span>
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        className="notes-workspace notes-workspace-loading is-error"
        aria-label="Notes workspace"
        aria-live="polite"
      >
        <span>Local notes could not be opened.</span>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            setLoadError(undefined);
            setLoadAttempt((current) => current + 1);
          }}
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="notes-workspace" aria-label="Notes workspace" style={editorStyle}>
      <header className="notes-titlebar">Yesterlog — Notes</header>
      <div className="notes-workspace-body">
        <NotesRail
          open={sidebarOpen}
          notebooks={notebooks}
          buckets={buckets}
          scopedTickets={scopedTickets}
          linkedBuckets={linkedBuckets}
          selectedContainer={selectedContainer}
          scope={scope}
          notebookAdding={notebookAdding}
          notebookName={notebookName}
          currentDate={currentDate}
          onChooseContainer={chooseContainer}
          onScopeChange={setScope}
          onOpenNewNote={openNewNote}
          onClose={() => setSidebarOpen(false)}
          onStartNotebookAdd={() => {
            setNotebookAdding(true);
            setNotebookName("");
          }}
          onNotebookNameChange={setNotebookName}
          onCancelNotebookAdd={() => {
            setNotebookAdding(false);
            setNotebookName("");
          }}
          onCreateNotebook={createNotebook}
        />

        <main className="notes-editor">
          <header className="notes-editor-header">
            <div className="notes-editor-context">
              {!sidebarOpen ? (
                <button
                  type="button"
                  className="notes-expand-button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Expand notes sidebar"
                >
                  <ChevronsRight size={15} />
                </button>
              ) : null}
              {selectedMeta.idLabel ? (
                <span className="notes-editor-key">{selectedMeta.idLabel}</span>
              ) : null}
              <span className={`notes-status-pill is-${selectedMeta.statusKind}`}>
                {selectedMeta.statusLabel}
              </span>
              <span className="notes-editor-meta">{selectedMeta.metaLine}</span>
            </div>
            <h1>{selectedMeta.title}</h1>
            <div
              className={`notes-toolbar${selectedMeta.isGeneral ? " is-general" : ""}`}
            >
              {selectedMeta.isGeneral ? (
                <div
                  className="notes-surface-tabs"
                  role="tablist"
                  aria-label="General notes view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generalSurface === "scratchpad"}
                    aria-controls="general-scratchpad-panel"
                    className={generalSurface === "scratchpad" ? "is-active" : ""}
                    onClick={() => {
                      setShowArchive(false);
                      setGeneralSurface("scratchpad");
                    }}
                  >
                    <FileText size={12} />
                    Scratchpad
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generalSurface === "items"}
                    aria-controls="general-items-panel"
                    className={generalSurface === "items" ? "is-active" : ""}
                    onClick={() => {
                      flushScratchpad();
                      setGeneralSurface("items");
                    }}
                  >
                    <ListTodo size={12} />
                    Notes &amp; to-dos
                    {counts.total ? <span>{counts.total}</span> : null}
                  </button>
                </div>
              ) : null}

              {showScratchpad ? (
                <span
                  className={`notes-scratchpad-save is-${scratchpadSaveState}`}
                  role={scratchpadSaveState === "error" ? "alert" : "status"}
                >
                  {scratchpadSaveState === "saving"
                    ? "Saving…"
                    : scratchpadSaveState === "error"
                      ? "Could not save"
                      : "Saved locally"}
                </span>
              ) : (
                <>
                  <div className="notes-filter-chips" role="group" aria-label="Note type">
                    {([
                      ["all", "All"],
                      ["todo", "To-dos"],
                      ["text", "Notes"]
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        className={typeFilter === value ? "is-active" : ""}
                        onClick={() => setTypeFilter(value)}
                        key={value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="notes-progress">
                    {progress.total
                      ? `${progress.done} of ${progress.total} done`
                      : counts.total
                        ? `${counts.total} ${counts.total === 1 ? "note" : "notes"}`
                        : ""}
                  </span>
                  {prAvailable && !showArchive ? (
                    <button
                      type="button"
                      className={`notes-tool-button is-pr${isPrOpen ? " is-open" : ""}`}
                      onClick={() =>
                        selectedJiraKey &&
                        setPrOpen((current) => ({
                          ...current,
                          [selectedJiraKey]: !current[selectedJiraKey]
                        }))
                      }
                    >
                      <GitPullRequest size={11} />
                      PR #{selectedPr?.pullRequestId ?? linkedPullRequest?.pullRequestId ?? 472}
                      {selectedPrOpenItemCount > 0 ? (
                        <i aria-label="Open pull request items" />
                      ) : null}
                    </button>
                  ) : null}
                  {selectedMeta.jira && !showArchive ? (
                    <button
                      type="button"
                      className={`notes-tool-button is-ai${isBriefingOpen ? " is-open" : ""}`}
                      onClick={() => void openBriefing()}
                      title={
                        settings.aiEnabled || isDemo
                          ? "AI briefing — risks and questions from ticket data"
                          : "Enable an AI provider in Settings"
                      }
                    >
                      {currentBriefing?.status === "loading" ? (
                        <LoaderCircle className="notes-spinner" size={11} />
                      ) : (
                        <Sparkles size={11} />
                      )}
                      {currentBriefing?.status === "loading" ? "Analyzing…" : "AI briefing"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`notes-tool-button${showArchive ? " is-archive-open" : ""}`}
                    onClick={() => setShowArchive((current) => !current)}
                  >
                    <Archive size={11} />
                    Archive · {counts.archived}
                  </button>
                </>
              )}
            </div>
          </header>

          {selectedMeta.jira?.statusCategory === "done" && progress.open > 0 && !showArchive ? (
            <div className="notes-mark-all">
              <span>
                Ticket is done, but <strong>{progress.open} {progress.open === 1 ? "item is" : "items are"}</strong> unchecked.
              </span>
              <button
                type="button"
                onClick={() =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    markAllWorkspaceTodosDone(bucket, new Date().toISOString())
                  )
                }
              >
                Mark all done
              </button>
            </div>
          ) : null}

          {showScratchpad ? (
            <div
              className="notes-editor-scroll notes-scratchpad-scroll"
              id="general-scratchpad-panel"
              role="tabpanel"
              aria-label="General scratchpad"
            >
              <div className="notes-editor-column notes-scratchpad-column">
                <section className="notes-scratchpad-sheet">
                  <ScratchpadEditor
                    initialText={scratchpadText}
                    initialEditorState={scratchpadEditorState}
                    onChange={scheduleScratchpadSave}
                    onPlainTextChange={setScratchpadPlainText}
                    onBlur={flushScratchpad}
                    onError={(message) =>
                      onErrorRef.current(`Scratchpad editor: ${message}`)
                    }
                  />
                  <footer>
                    <span>
                      <LockKeyhole size={11} />
                      Local only · never included in Jira or AI briefings
                    </span>
                    <span>
                      {scratchpadWordCount} {scratchpadWordCount === 1 ? "word" : "words"}
                      {scratchpadLineCount
                        ? ` · ${scratchpadLineCount} ${scratchpadLineCount === 1 ? "line" : "lines"}`
                        : ""}
                    </span>
                  </footer>
                </section>
              </div>
            </div>
          ) : (
            <div
              className="notes-editor-scroll"
              id={selectedMeta.isGeneral ? "general-items-panel" : undefined}
              role={selectedMeta.isGeneral ? "tabpanel" : undefined}
              aria-label={
                selectedMeta.isGeneral ? "General notes and to-dos" : undefined
              }
            >
              <div className="notes-editor-column">
              {isPrOpen && prAvailable && !showArchive ? (
                <NotesPrPanel
                  pr={selectedPr}
                  isLoading={selectedPrEntry?.status === "loading"}
                  fallbackId={linkedPullRequest?.pullRequestId}
                  fallbackTitle={linkedPullRequest?.title}
                  tasksForPanel={selectedPrTasksForPanel}
                  allClear={selectedPrAllClear}
                  isTaskPending={(taskId) =>
                    Boolean(selectedPr && pendingPrTasks.has(`${pullRequestTargetId(selectedPr)}/${taskId}`))
                  }
                  hasTodoText={hasTodoText}
                  onToggleTask={(taskId) => void togglePrTask(taskId)}
                  onAddTodo={(text) =>
                    addNoteToContainer(selectedContainer, text, "todo", selectedMeta.jira)
                  }
                  onClose={() =>
                    selectedJiraKey &&
                    setPrOpen((current) => ({ ...current, [selectedJiraKey]: false }))
                  }
                  onRetry={() =>
                    selectedJiraKey &&
                    setPrCache((current) => {
                      const next = { ...current };
                      delete next[selectedJiraKey];
                      return next;
                    })
                  }
                />
              ) : null}

              {isBriefingOpen && currentBriefing && !showArchive ? (
                <NotesAiPanel
                  briefing={currentBriefing}
                  hasTodoText={hasTodoText}
                  onAddTodo={(text) =>
                    addNoteToContainer(selectedContainer, text, "todo", selectedMeta.jira)
                  }
                  onClose={() =>
                    selectedJiraKey &&
                    setBriefingOpen((current) => ({ ...current, [selectedJiraKey]: false }))
                  }
                />
              ) : null}

              <NotesList
                notes={visibleNotes}
                hasFilteredOut={typeFilter !== "all" && baseVisibleNotes.length > 0}
                typeFilter={typeFilter}
                showArchive={showArchive}
                nick={selectedMeta.nick}
                canMoveToGeneral={!showArchive && !selectedMeta.isGeneral && !selectedMeta.isNotebook}
                editingNoteId={editingNoteId}
                editingText={editingText}
                currentDate={currentDate}
                onToggleDone={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    setWorkspaceNoteDone(bucket, note.id, !note.done, new Date().toISOString())
                  )
                }
                onArchive={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    setWorkspaceNoteArchived(bucket, note.id, !showArchive, new Date().toISOString())
                  )
                }
                onMoveToGeneral={moveNoteToGeneral}
                onDelete={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    deleteWorkspaceNote(bucket, note.id)
                  )
                }
                onStartEdit={(note) => {
                  setEditingNoteId(note.id);
                  setEditingText(note.text);
                }}
                onEditingTextChange={setEditingText}
                onCommitEdit={commitEdit}
                onCancelEdit={() => {
                  setEditingNoteId(undefined);
                  setEditingText("");
                }}
              />
              </div>
            </div>
          )}

          {!showScratchpad ? (
            <footer className="notes-composer-shell">
              <div className="notes-editor-column">
                {!showArchive ? (
                  <div className="notes-composer">
                  <button
                    type="button"
                    className={composerTodo ? "is-active" : ""}
                    onClick={() => setComposerTodo((current) => !current)}
                    aria-label={composerTodo ? "Add as plain note" : "Add as to-do"}
                    aria-pressed={composerTodo}
                  >
                    <ListTodo size={15} />
                  </button>
                  <input
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const added = addNoteToContainer(
                          selectedContainer,
                          composerText,
                          composerTodo ? "todo" : "text",
                          selectedMeta.jira
                        );
                        if (added) setComposerText("");
                      }
                    }}
                    placeholder={`Add a ${composerTodo ? "to-do" : "note"} to ${selectedMeta.nick}…`}
                  />
                  <button
                    type="button"
                    className="notes-add-button"
                    onClick={() => {
                      const added = addNoteToContainer(
                        selectedContainer,
                        composerText,
                        composerTodo ? "todo" : "text",
                        selectedMeta.jira
                      );
                      if (added) setComposerText("");
                    }}
                    disabled={!composerText.trim()}
                  >
                    Add
                  </button>
                  </div>
                ) : (
                  <p className="notes-archive-caption">
                    Viewing archived notes — restore one to bring it back.
                  </p>
                )}
              </div>
            </footer>
          ) : null}
        </main>
      </div>

      {newNoteOpen ? (
        <NotesNewNoteModal
          text={newNoteText}
          todo={newNoteTodo}
          search={newNoteSearch}
          searchLoading={searchLoading}
          targetOptions={targetOptions}
          selectedTarget={selectedTarget}
          onClose={() => setNewNoteOpen(false)}
          onSave={saveNewNote}
          onTextChange={setNewNoteText}
          onToggleTodo={() => setNewNoteTodo((current) => !current)}
          onSearchChange={setNewNoteSearch}
          onPickTarget={(target) => {
            setNewNoteTarget(target.containerId);
            setNewNoteTargetOption(target);
          }}
          onResetTarget={() => {
            setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
            setNewNoteTargetOption(undefined);
          }}
        />
      ) : null}
    </section>
  );
};
