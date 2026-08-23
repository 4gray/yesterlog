import {
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  FileText,
  GitPullRequest,
  Lightbulb,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  MoveUpRight,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
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

  const renderSidebarTicket = (
    ticket: NoteTicketActivity | WorkspaceNoteBucket,
    linked = false
  ) => {
    const jira = "lastWorkedAt" in ticket ? ticket : ticket.jira!;
    const key = jira.key.toUpperCase();
    const noteBucket = buckets[key];
    const open = countOpenWorkspaceTodos(noteBucket?.notes ?? []);
    const selected = selectedContainer === key;
    const done = jira.statusCategory === "done";
    const color = accentForKey(key);
    return (
      <button
        type="button"
        key={key}
        className={`notes-ticket-row${selected ? " is-selected" : ""}${done ? " is-done" : ""}`}
        onClick={() => chooseContainer(key)}
        style={{ "--ticket-color": color } as CSSProperties}
      >
        <span className="notes-ticket-bar" />
        <span className="notes-ticket-copy">
          <span className="notes-ticket-key">
            {key}
            {done ? <CheckCircle2 size={12} aria-label="Done" /> : null}
          </span>
          <span className="notes-ticket-title">{jira.summary}</span>
        </span>
        {linked ? <span className="notes-type-badge">{issueTypeLabel(jira)}</span> : null}
        <span className="notes-ticket-tail">
          {open ? <span className="notes-open-count">{open} open</span> : null}
          {"lastWorkedAt" in ticket ? (
            <span className="notes-recency">{formatRecency(ticket.lastWorkedAt, currentDate)}</span>
          ) : null}
        </span>
      </button>
    );
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
        {!sidebarOpen ? null : (
          <button
            type="button"
            className="notes-rail-scrim"
            aria-label="Close notes sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`notes-rail${sidebarOpen ? " is-open" : ""}`} aria-label="Notes">
          <div className="notes-rail-header">
            <span className="notes-rail-icon"><NotebookPen size={15} /></span>
            <strong>Notes</strong>
            <button type="button" className="notes-icon-button" onClick={openNewNote} aria-label="New note">
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="notes-icon-button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse notes sidebar"
            >
              <ChevronsLeft size={15} />
            </button>
          </div>

          <div className="notes-scope" aria-label="Ticket activity range">
            {(["today", "week", "all"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={scope === value ? "is-active" : ""}
                onClick={() => setScope(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>

          <div className="notes-rail-scroll">
            <section className="notes-rail-section">
              <div className="notes-section-heading">
                <span>Notebooks</span>
                <i />
                <button
                  type="button"
                  onClick={() => {
                    setNotebookAdding(true);
                    setNotebookName("");
                  }}
                  aria-label="Create notebook"
                >
                  <Plus size={12} />
                </button>
              </div>
              <button
                type="button"
                className={`notes-notebook-row${selectedContainer === GENERAL_NOTES_CONTAINER_ID ? " is-selected" : ""}`}
                onClick={() => chooseContainer(GENERAL_NOTES_CONTAINER_ID)}
              >
                <span className="notes-notebook-icon"><Lightbulb size={12} /></span>
                <span>General notes</span>
                {countOpenWorkspaceTodos(buckets[GENERAL_NOTES_CONTAINER_ID]?.notes ?? []) ? (
                  <em>{countOpenWorkspaceTodos(buckets[GENERAL_NOTES_CONTAINER_ID]?.notes ?? [])} open</em>
                ) : null}
              </button>
              {notebooks.map((notebook) => {
                const containerId = notebookContainerId(notebook.id);
                const open = countOpenWorkspaceTodos(buckets[containerId]?.notes ?? []);
                return (
                  <button
                    type="button"
                    className={`notes-notebook-row${selectedContainer === containerId ? " is-selected" : ""}`}
                    onClick={() => chooseContainer(containerId)}
                    key={notebook.id}
                  >
                    <span className="notes-notebook-icon"><BookOpen size={12} /></span>
                    <span>{notebook.title}</span>
                    {open ? <em>{open} open</em> : null}
                  </button>
                );
              })}
              {notebookAdding ? (
                <input
                  className="notes-notebook-input"
                  value={notebookName}
                  onChange={(event) => setNotebookName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createNotebook();
                    if (event.key === "Escape") {
                      setNotebookAdding(false);
                      setNotebookName("");
                    }
                  }}
                  placeholder="Notebook name… (Enter)"
                  autoFocus
                />
              ) : null}
            </section>

            <section className="notes-rail-section">
              <div className="notes-section-heading notes-ticket-heading">
                <span>
                  {scopedTickets.length} {scopedTickets.length === 1 ? "ticket" : "tickets"} ·{" "}
                  {scope === "today" ? "worked today" : scope === "week" ? "worked this week" : "all time"}
                </span>
                <i />
              </div>
              <div className="notes-ticket-list">
                {scopedTickets.map((ticket) => renderSidebarTicket(ticket))}
                {!scopedTickets.length ? (
                  <p className="notes-scope-empty">Nothing tracked in this range. Switch to All…</p>
                ) : null}
              </div>
            </section>

            {linkedBuckets.length ? (
              <section className="notes-rail-section">
                <div className="notes-section-heading">
                  <span>Linked via search</span>
                  <i />
                </div>
                <div className="notes-ticket-list">
                  {linkedBuckets.map((bucket) => renderSidebarTicket(bucket, true))}
                </div>
              </section>
            ) : null}
          </div>

          <footer className="notes-rail-footer">
            <LockKeyhole size={11} />
            <span>Local only · never synced to Jira</span>
          </footer>
        </aside>

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
                <section className="notes-panel notes-pr-panel" aria-label="Bitbucket pull request">
                  <header>
                    <GitPullRequest size={14} />
                    <strong>
                      PR #{selectedPr?.pullRequestId ?? linkedPullRequest?.pullRequestId} —{" "}
                      {selectedPr?.title ?? linkedPullRequest?.title ?? "Pull request"}
                    </strong>
                    {selectedPr ? (
                      <span className={`notes-pr-status is-${selectedPr.state.toLowerCase()}`}>
                        {selectedPr.state === "MERGED"
                          ? "Merged"
                          : selectedPr.state === "OPEN"
                            ? "Open"
                            : selectedPr.state.charAt(0).toUpperCase() +
                              selectedPr.state.slice(1).toLowerCase()}
                      </span>
                    ) : null}
                    <span className="notes-panel-meta">
                      {selectedPr
                        ? `${selectedPr.approvalCount} ${selectedPr.approvalCount === 1 ? "approval" : "approvals"} · ${selectedPr.commentCount} comments`
                        : "Loading live details…"}
                    </span>
                    {selectedPr?.url ? (
                      <a href={selectedPr.url} target="_blank" rel="noreferrer">
                        Open in Bitbucket <ExternalLink size={10} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="notes-panel-close"
                      onClick={() =>
                        selectedJiraKey &&
                        setPrOpen((current) => ({ ...current, [selectedJiraKey]: false }))
                      }
                      aria-label="Close pull request panel"
                    >
                      <X size={13} />
                    </button>
                  </header>

                  {selectedPrEntry?.status === "loading" ? (
                    <div className="notes-panel-loading">
                      <LoaderCircle className="notes-spinner" size={14} />
                      Loading tasks and comments from Bitbucket…
                    </div>
                  ) : selectedPr ? (
                    <>
                      {selectedPrTasksForPanel.length ? (
                        <div className="notes-pr-section">
                          <h2>Tasks</h2>
                          {selectedPrTasksForPanel.map((task) => (
                            <div className={`notes-pr-task${task.resolved ? " is-done" : ""}`} key={task.id}>
                              <button
                                type="button"
                                className="notes-checkbox"
                                aria-label={task.resolved ? "Reopen task in Bitbucket" : "Resolve task in Bitbucket"}
                                aria-pressed={task.resolved}
                                disabled={pendingPrTasks.has(
                                  `${pullRequestTargetId(selectedPr)}/${task.id}`
                                )}
                                onClick={() => void togglePrTask(task.id)}
                              >
                                {task.resolved ? <Check size={12} /> : null}
                              </button>
                              <div>
                                <p>{task.content}</p>
                                <span>
                                  {task.authorDisplayName || "Bitbucket"}
                                  {task.resolved ? " · resolved, synced to Bitbucket" : ""}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {selectedPr.comments.length ? (
                        <div className="notes-pr-section">
                          <h2>Unresolved comments</h2>
                          {selectedPr.comments.map((comment) => {
                            const todoText = commentTodoText(
                              comment.authorDisplayName,
                              comment.content
                            );
                            const added = hasTodoText(todoText);
                            return (
                              <div className="notes-pr-comment" key={comment.id}>
                                <span className="notes-avatar">{comment.authorInitials}</span>
                                <div>
                                  <p>{comment.content}</p>
                                  <span>
                                    {comment.authorDisplayName}
                                    {comment.path
                                      ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ""}`
                                      : ""}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={added ? "is-added" : ""}
                                  disabled={added}
                                  onClick={() =>
                                    addNoteToContainer(
                                      selectedContainer,
                                      todoText,
                                      "todo",
                                      selectedMeta.jira
                                    )
                                  }
                                >
                                  {added ? "Added ✓" : "+ to-do"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {selectedPrAllClear ||
                      (!selectedPr.tasks.length && !selectedPr.comments.length) ? (
                        <div className="notes-pr-clear">
                          <CheckCircle2 size={16} />
                          No open tasks or unresolved comments.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="notes-panel-empty">
                      <span>Pull request details are unavailable.</span>
                      {selectedJiraKey ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPrCache((current) => {
                              const next = { ...current };
                              delete next[selectedJiraKey];
                              return next;
                            })
                          }
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  )}
                  <footer>
                    Live from Bitbucket — checking a task resolves it in the PR. Comments are copied only when you choose + to-do.
                  </footer>
                </section>
              ) : null}

              {isBriefingOpen && currentBriefing && !showArchive ? (
                <section className="notes-panel notes-ai-panel" aria-label="AI briefing">
                  <header>
                    <Sparkles size={14} />
                    <strong>AI briefing</strong>
                    <span className="notes-panel-meta">
                      {currentBriefing.sourceLabel}
                    </span>
                    <button
                      type="button"
                      className="notes-panel-close"
                      onClick={() =>
                        selectedJiraKey &&
                        setBriefingOpen((current) => ({
                          ...current,
                          [selectedJiraKey]: false
                        }))
                      }
                      aria-label="Close AI briefing"
                    >
                      <X size={13} />
                    </button>
                  </header>
                  {currentBriefing.status === "loading" ? (
                    <div className="notes-panel-loading">
                      <LoaderCircle className="notes-spinner" size={14} />
                      Reading ticket description, comments, and pull request…
                    </div>
                  ) : currentBriefing.suggestions.length ? (
                    <div className="notes-ai-suggestions">
                      {currentBriefing.suggestions.map((suggestion) => {
                        const added = hasTodoText(suggestion.text);
                        return (
                          <div className="notes-ai-suggestion" key={suggestion.id}>
                            <span className={`is-${suggestion.kind}`}>{suggestion.kind}</span>
                            <p>{suggestion.text}</p>
                            <button
                              type="button"
                              className={added ? "is-added" : ""}
                              disabled={added}
                              onClick={() =>
                                addNoteToContainer(
                                  selectedContainer,
                                  suggestion.text,
                                  "todo",
                                  selectedMeta.jira
                                )
                              }
                            >
                              {added ? "Added ✓" : "+ to-do"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="notes-panel-empty">No grounded suggestions were returned. Your notes are unchanged.</p>
                  )}
                  <footer>
                    Suggestions, not facts — generated by your AI provider from ticket data. Your notes stay local and are never sent.
                  </footer>
                </section>
              ) : null}

              {visibleNotes.length ? (
                <div className="notes-list" aria-label={showArchive ? "Archived notes" : "Notes"}>
                  {visibleNotes.map((note) => (
                    <article
                      className={`notes-row${note.done ? " is-done" : ""}`}
                      key={note.id}
                    >
                      {note.type === "todo" ? (
                        <button
                          type="button"
                          className="notes-checkbox"
                          aria-label={note.done ? "Mark to-do open" : "Mark to-do done"}
                          aria-pressed={note.done}
                          onClick={() =>
                            mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                              setWorkspaceNoteDone(
                                bucket,
                                note.id,
                                !note.done,
                                new Date().toISOString()
                              )
                            )
                          }
                        >
                          {note.done ? <Check size={12} /> : null}
                        </button>
                      ) : (
                        <FileText className="notes-text-icon" size={15} />
                      )}
                      <div className="notes-row-copy">
                        {editingNoteId === note.id ? (
                          <input
                            className="notes-inline-edit"
                            value={editingText}
                            onChange={(event) => setEditingText(event.target.value)}
                            onBlur={() => commitEdit(note.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") commitEdit(note.id);
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setEditingNoteId(undefined);
                                setEditingText("");
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="notes-row-text"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingText(note.text);
                            }}
                          >
                            {note.text}
                          </button>
                        )}
                        <time dateTime={note.createdAt}>
                          {formatNoteDate(note.createdAt, currentDate)}
                        </time>
                      </div>
                      <div className="notes-row-actions">
                        <button
                          type="button"
                          onClick={() =>
                            mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                              setWorkspaceNoteArchived(
                                bucket,
                                note.id,
                                !showArchive,
                                new Date().toISOString()
                              )
                            )
                          }
                          aria-label={showArchive ? "Restore from archive" : "Archive note"}
                          title={showArchive ? "Restore from archive" : "Archive note"}
                        >
                          <Archive size={13} />
                        </button>
                        {!showArchive && !selectedMeta.isGeneral && !selectedMeta.isNotebook ? (
                          <button
                            type="button"
                            onClick={() => {
                              const source = bucketsRef.current[selectedContainer] ?? selectedBucket;
                              const target = bucketsRef.current[GENERAL_NOTES_CONTAINER_ID] ?? {
                                containerId: GENERAL_NOTES_CONTAINER_ID,
                                notes: []
                              };
                              if (!isDemo && !jiraNoteScope) {
                                onErrorRef.current(
                                  "Sync Jira once before saving ticket notes for this account."
                                );
                                return;
                              }
                              const moved = moveWorkspaceNote(
                                source,
                                target,
                                note.id,
                                new Date().toISOString()
                              );
                              const next = {
                                ...bucketsRef.current,
                                [selectedContainer]: moved.source,
                                [GENERAL_NOTES_CONTAINER_ID]: moved.target
                              };
                              setBucketState(next);
                              if (!isDemo) {
                                const capturedScope = jiraNoteScope ?? null;
                                enqueueMutation(() =>
                                  saveWorkspaceNoteBuckets([
                                    moved.source,
                                    moved.target
                                  ], capturedScope)
                                );
                              }
                            }}
                            aria-label="Move to General notes"
                            title="Move to General notes"
                          >
                            <MoveUpRight size={13} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                              deleteWorkspaceNote(bucket, note.id)
                            )
                          }
                          aria-label="Delete note"
                          title="Delete note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notes-empty">
                  <span><NotebookPen size={20} /></span>
                  <strong>
                    {typeFilter !== "all" && baseVisibleNotes.length
                      ? `No ${typeFilter === "todo" ? "to-dos" : "plain notes"} here`
                      : showArchive
                        ? `No archived notes on ${selectedMeta.nick}`
                        : `No notes on ${selectedMeta.nick} yet`}
                  </strong>
                  <p>
                    {typeFilter !== "all" && baseVisibleNotes.length
                      ? "Switch the filter to see the other items."
                      : showArchive
                        ? "Archive a note with the box icon — it moves here, out of the way."
                        : "Jot anything below — a gotcha, a reminder, a link."}
                  </p>
                </div>
              )}
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
        <div
          className="notes-modal-backdrop"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) setNewNoteOpen(false);
          }}
        >
          <section
            className="notes-new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-note-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setNewNoteOpen(false);
              }
            }}
          >
            <header>
              <h2 id="new-note-title">New note</h2>
              <button type="button" onClick={() => setNewNoteOpen(false)} aria-label="Close new note">
                <X size={14} />
              </button>
            </header>
            <div className="notes-modal-composer">
              <button
                type="button"
                className={newNoteTodo ? "is-active" : ""}
                onClick={() => setNewNoteTodo((current) => !current)}
                aria-label={newNoteTodo ? "Save as plain note" : "Save as to-do"}
                aria-pressed={newNoteTodo}
              >
                <ListTodo size={15} />
              </button>
              <input
                value={newNoteText}
                onChange={(event) => setNewNoteText(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter") saveNewNote();
                }}
                placeholder={
                  newNoteTodo ? "Write a to-do…" : "Write a note…  ( [] makes it a to-do )"
                }
                autoFocus
              />
            </div>
            <span className="notes-modal-label">Attach to</span>
            <div className={`notes-target-chip${selectedTarget.containerId !== GENERAL_NOTES_CONTAINER_ID ? " is-picked" : ""}`}>
              <i style={{ background: selectedTarget.color }} />
              <span>{selectedTarget.label}</span>
              {selectedTarget.containerId !== GENERAL_NOTES_CONTAINER_ID ? (
                <button
                  type="button"
                  onClick={() => {
                    setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
                    setNewNoteTargetOption(undefined);
                  }}
                  aria-label="Reset target to General notes"
                >
                  <X size={11} />
                </button>
              ) : (
                <em>or pick anything from Jira below</em>
              )}
            </div>
            <div className="notes-modal-search">
              <Search size={14} />
              <input
                value={newNoteSearch}
                onChange={(event) => setNewNoteSearch(event.target.value)}
                placeholder="Search tickets, epics, sub-tasks…"
              />
              {searchLoading ? <LoaderCircle className="notes-spinner" size={13} /> : null}
            </div>
            <div className="notes-search-results" aria-label="Attach targets">
              {targetOptions.map((target) => (
                <button
                  type="button"
                  key={target.containerId}
                  onClick={() => {
                    setNewNoteTarget(target.containerId);
                    setNewNoteTargetOption(target);
                  }}
                >
                  <span className="notes-type-badge">{target.typeLabel}</span>
                  <i style={{ background: target.color }} />
                  <span>{target.label}</span>
                </button>
              ))}
              {!targetOptions.length && !searchLoading ? (
                <p>No matching Jira tickets or notebooks.</p>
              ) : null}
            </div>
            <footer>
              <span><LockKeyhole size={11} /> Stored locally · never synced to Jira</span>
              <button
                type="button"
                onClick={saveNewNote}
                disabled={!newNoteText.trim()}
              >
                Save note
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
};
