import type {
  JiraEpicInfo,
  JiraIssueTypeInfo,
  TicketStatusCategory
} from "../../shared/types";
import { addDays, toLocalDateKey } from "../utils/date";

export const GENERAL_NOTES_CONTAINER_ID = "GENERAL";
export const NOTEBOOK_CONTAINER_PREFIX = "notebook:";

export type WorkspaceNoteType = "todo" | "text";
export type WorkspaceNoteFilter = "all" | WorkspaceNoteType;
export type NoteTicketScope = "today" | "week" | "all";

export interface WorkspaceNote {
  id: string;
  type: WorkspaceNoteType;
  done: boolean;
  text: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteJiraSnapshot {
  key: string;
  summary: string;
  url?: string;
  statusName?: string;
  statusCategory?: TicketStatusCategory;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
}

export interface WorkspaceNoteBucket {
  containerId: string;
  jira?: NoteJiraSnapshot;
  notes: WorkspaceNote[];
}

export interface NoteNotebook {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTicketActivity extends NoteJiraSnapshot {
  lastWorkedAt: string;
  loggedSeconds: number;
}

export interface WorkspaceNoteCounts {
  total: number;
  todos: number;
  texts: number;
  done: number;
  open: number;
  archived: number;
}

export interface WorkspaceNoteProgress {
  done: number;
  total: number;
  open: number;
}

export interface ParsedWorkspaceNoteInput {
  type: WorkspaceNoteType;
  text: string;
}

export interface VisibleWorkspaceNoteOptions {
  filter?: WorkspaceNoteFilter;
  archived?: boolean;
}

export const notebookContainerId = (id: string) => {
  const normalized = id.trim();
  return normalized.startsWith(NOTEBOOK_CONTAINER_PREFIX)
    ? normalized
    : `${NOTEBOOK_CONTAINER_PREFIX}${normalized}`;
};

export const isNotebookContainerId = (containerId: string) =>
  containerId.startsWith(NOTEBOOK_CONTAINER_PREFIX);

/**
 * The composer accepts `[] ` or `[ ] ` as a quick to-do prefix. The prefix
 * wins over the active composer mode and is removed before the note is stored.
 */
export const parseWorkspaceNoteInput = (
  input: string,
  defaultType: WorkspaceNoteType = "text"
): ParsedWorkspaceNoteInput => {
  const prefixMatch = input.match(/^\s*\[\s?\]\s+/);
  return {
    type: prefixMatch ? "todo" : defaultType,
    text: (prefixMatch ? input.slice(prefixMatch[0].length) : input).trim()
  };
};

export const getVisibleWorkspaceNotes = (
  notes: WorkspaceNote[],
  { filter = "all", archived = false }: VisibleWorkspaceNoteOptions = {}
) =>
  notes.filter(
    (note) =>
      Boolean(note.archivedAt) === archived &&
      (filter === "all" || note.type === filter)
  );

export const getWorkspaceNoteCounts = (notes: WorkspaceNote[]): WorkspaceNoteCounts => {
  const active = notes.filter((note) => !note.archivedAt);
  const todos = active.filter((note) => note.type === "todo");

  return {
    total: active.length,
    todos: todos.length,
    texts: active.length - todos.length,
    done: todos.filter((note) => note.done).length,
    open: todos.filter((note) => !note.done).length,
    archived: notes.length - active.length
  };
};

export const getWorkspaceNoteProgress = (
  notes: WorkspaceNote[]
): WorkspaceNoteProgress => {
  const { done, todos: total, open } = getWorkspaceNoteCounts(notes);
  return { done, total, open };
};

export const countOpenWorkspaceTodos = (notes: WorkspaceNote[]) =>
  getWorkspaceNoteCounts(notes).open;

const activityTime = (activity: NoteTicketActivity) => {
  const timestamp = Date.parse(activity.lastWorkedAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const compareActivity = (
  left: NoteTicketActivity,
  right: NoteTicketActivity
) => {
  const leftTime = activityTime(left) ?? Number.NEGATIVE_INFINITY;
  const rightTime = activityTime(right) ?? Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || left.key.localeCompare(right.key, undefined, { numeric: true });
};

/**
 * Today is the local calendar day. Week is the rolling seven local-date range
 * ending today, matching the workspace handoff rather than the app's Monday
 * calendar-week navigation.
 */
export const getScopedNoteTicketActivity = (
  activity: NoteTicketActivity[],
  scope: NoteTicketScope,
  now = new Date()
) => {
  if (scope === "all") {
    return [...activity].sort(compareActivity);
  }

  const todayKey = toLocalDateKey(now);
  const earliestKey = toLocalDateKey(addDays(now, -6));

  return activity
    .filter((item) => {
      const timestamp = activityTime(item);
      if (timestamp === undefined) {
        return false;
      }
      const dateKey = toLocalDateKey(new Date(timestamp));
      return scope === "today"
        ? dateKey === todayKey
        : dateKey >= earliestKey && dateKey <= todayKey;
    })
    .sort(compareActivity);
};

export const upsertWorkspaceNoteBucket = (
  buckets: WorkspaceNoteBucket[],
  bucket: WorkspaceNoteBucket
) => [
  ...buckets.filter((candidate) => candidate.containerId !== bucket.containerId),
  bucket
];

export const removeWorkspaceNoteBucket = (
  buckets: WorkspaceNoteBucket[],
  containerId: string
) => buckets.filter((bucket) => bucket.containerId !== containerId);

export const addWorkspaceNote = (
  bucket: WorkspaceNoteBucket,
  note: WorkspaceNote
): WorkspaceNoteBucket => ({
  ...bucket,
  notes: [...bucket.notes, note]
});

export const updateWorkspaceNoteText = (
  bucket: WorkspaceNoteBucket,
  noteId: string,
  text: string,
  updatedAt: string
): WorkspaceNoteBucket => {
  const normalized = text.trim();
  if (!normalized) {
    return bucket;
  }

  return {
    ...bucket,
    notes: bucket.notes.map((note) =>
      note.id === noteId ? { ...note, text: normalized, updatedAt } : note
    )
  };
};

export const setWorkspaceNoteDone = (
  bucket: WorkspaceNoteBucket,
  noteId: string,
  done: boolean,
  updatedAt: string
): WorkspaceNoteBucket => ({
  ...bucket,
  notes: bucket.notes.map((note) =>
    note.id === noteId && note.type === "todo"
      ? { ...note, done, updatedAt }
      : note
  )
});

export const setWorkspaceNoteArchived = (
  bucket: WorkspaceNoteBucket,
  noteId: string,
  archived: boolean,
  updatedAt: string
): WorkspaceNoteBucket => ({
  ...bucket,
  notes: bucket.notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }

    if (archived) {
      return { ...note, archivedAt: updatedAt, updatedAt };
    }

    const { archivedAt: _archivedAt, ...restored } = note;
    return { ...restored, updatedAt };
  })
});

export const deleteWorkspaceNote = (
  bucket: WorkspaceNoteBucket,
  noteId: string
): WorkspaceNoteBucket => ({
  ...bucket,
  notes: bucket.notes.filter((note) => note.id !== noteId)
});

export const moveWorkspaceNote = (
  source: WorkspaceNoteBucket,
  target: WorkspaceNoteBucket,
  noteId: string,
  updatedAt: string
): { source: WorkspaceNoteBucket; target: WorkspaceNoteBucket } => {
  const note = source.notes.find((candidate) => candidate.id === noteId);
  if (!note) {
    return { source, target };
  }

  return {
    source: deleteWorkspaceNote(source, noteId),
    target: addWorkspaceNote(target, { ...note, updatedAt })
  };
};

export const markAllWorkspaceTodosDone = (
  bucket: WorkspaceNoteBucket,
  updatedAt: string
): WorkspaceNoteBucket => ({
  ...bucket,
  notes: bucket.notes.map((note) =>
    note.type === "todo" && !note.done && !note.archivedAt
      ? { ...note, done: true, updatedAt }
      : note
  )
});
