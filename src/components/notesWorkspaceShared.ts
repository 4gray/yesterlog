import type {
  BitbucketPullRequestDetailsResult,
  JiraTicket
} from "../../shared/types";
import type { NotesBriefingSuggestion } from "../domain/notesBriefing";
import type {
  NoteJiraSnapshot,
  NoteTicketActivity,
  WorkspaceNote,
  WorkspaceNoteBucket,
  WorkspaceNoteDocument
} from "../domain/ticketNotes";
import { toLocalDateKey } from "../utils/date";
import type { ScratchpadEditorValue } from "./ScratchpadEditor";

/* Shared types, constants and pure helpers for the Notes workspace. */

export type BucketMap = Record<string, WorkspaceNoteBucket>;

export interface PullRequestCacheEntry {
  status: "loading" | "ready" | "error";
  targetId: string;
  details?: BitbucketPullRequestDetailsResult;
}

export interface BriefingCacheEntry {
  status: "loading" | "ready";
  suggestions: NotesBriefingSuggestion[];
  sourceLabel: string;
}

export type GeneralNotesSurface = "scratchpad" | "items";
export type ScratchpadSaveState = "saved" | "saving" | "error";

export interface ScratchpadDraft {
  text: string;
  editorState?: string;
  plainText: string;
}

export const SCRATCHPAD_SAVE_DELAY_MS = 650;

export const scratchpadDraftKey = ({ text, editorState }: ScratchpadDraft) =>
  `${text}\u0000${editorState ?? ""}`;

export interface TargetOption {
  containerId: string;
  label: string;
  typeLabel: string;
  color: string;
  jira?: NoteJiraSnapshot;
}

export interface ContainerMeta {
  containerId: string;
  idLabel: string;
  title: string;
  nick: string;
  color: string;
  statusLabel: string;
  statusKind: string;
  metaLine: string;
  jira?: NoteJiraSnapshot;
  activity?: NoteTicketActivity;
  isNotebook: boolean;
  isGeneral: boolean;
}

export interface LinkedPullRequest {
  workspace: string;
  repositorySlug: string;
  pullRequestId: number;
  title: string;
  url?: string;
  occurredAt: string;
}

export const pullRequestTargetId = (
  target: Pick<LinkedPullRequest, "workspace" | "repositorySlug" | "pullRequestId">
) =>
  `${target.workspace.trim().toLowerCase()}/${target.repositorySlug.trim().toLowerCase()}/${target.pullRequestId}`;

export const jiraOrigin = (value?: string) => {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

export const TICKET_COLORS = [
  "#4f7cff",
  "#edc488",
  "#bda6f5",
  "#7fc8e8",
  "#6bd0c2",
  "#f08a8a"
];

export const uid = (prefix: string) => {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
};

export const accentForKey = (key: string) => {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return TICKET_COLORS[Math.abs(hash) % TICKET_COLORS.length];
};

export const formatDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${hours}h`;
};

export const formatRecency = (value: string, currentDate: Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const currentKey = toLocalDateKey(currentDate);
  const dateKey = toLocalDateKey(date);
  if (dateKey === currentKey) return "today";
  const yesterday = new Date(currentDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === toLocalDateKey(yesterday)) return "yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
};

export const formatNoteDate = (value: string, currentDate: Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateKey = toLocalDateKey(date);
  if (dateKey === toLocalDateKey(currentDate)) return "Today";
  const yesterday = new Date(currentDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === toLocalDateKey(yesterday)) return "Yesterday";
  const ageDays = Math.floor((currentDate.getTime() - date.getTime()) / 86_400_000);
  if (ageDays >= 0 && ageDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
};

export const jiraSnapshotFromTicket = (ticket: JiraTicket): NoteJiraSnapshot => ({
  key: ticket.key.trim().toUpperCase(),
  summary: ticket.summary,
  url: ticket.url,
  statusName: ticket.statusName,
  statusCategory: ticket.statusCategory,
  issueType: ticket.issueType,
  epic: ticket.epic
});

export const issueTypeLabel = (jira: NoteJiraSnapshot | undefined) => {
  const normalized = jira?.issueType?.name?.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (jira?.issueType?.subtask || (jira?.issueType?.hierarchyLevel ?? 0) < 0 || normalized === "subtask") {
    return "SUB-TASK";
  }
  if (jira?.issueType?.hierarchyLevel === 1 || normalized === "epic") {
    return "EPIC";
  }
  return normalized === "story" ? "STORY" : "TASK";
};
