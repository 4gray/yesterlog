import { Check, CheckCircle2, ExternalLink, GitPullRequest, LoaderCircle, X } from "lucide-react";
import type { BitbucketPullRequestDetailsResult } from "../../shared/types";

export interface NotesPrPanelProps {
  /** Live details, once loaded. */
  pr?: BitbucketPullRequestDetailsResult;
  isLoading: boolean;
  /** Fallback identity from review history while details load. */
  fallbackId?: number;
  fallbackTitle?: string;
  /** MERGED PRs hide resolved tasks; open PRs show them all. */
  tasksForPanel: BitbucketPullRequestDetailsResult["tasks"];
  allClear: boolean;
  isTaskPending: (taskId: number) => boolean;
  hasTodoText: (text: string) => boolean;
  onToggleTask: (taskId: number) => void;
  onAddTodo: (text: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

/** One reviewer comment becomes one actionable to-do line. */
const commentTodoText = (author: string, content: string) =>
  `${author.trim().split(/\s+/)[0] || "Reviewer"} on PR: ${content}`;

/** Bitbucket PR panel: live tasks (two-way) and unresolved comments (copy to to-do). */
export const NotesPrPanel = ({
  pr,
  isLoading,
  fallbackId,
  fallbackTitle,
  tasksForPanel,
  allClear,
  isTaskPending,
  hasTodoText,
  onToggleTask,
  onAddTodo,
  onClose,
  onRetry
}: NotesPrPanelProps) => (
  <section className="notes-panel notes-pr-panel" aria-label="Bitbucket pull request">
    <header>
      <GitPullRequest size={14} />
      <strong>
        PR #{pr?.pullRequestId ?? fallbackId} — {pr?.title ?? fallbackTitle ?? "Pull request"}
      </strong>
      {pr ? (
        <span className={`notes-pr-status is-${pr.state.toLowerCase()}`}>
          {pr.state === "MERGED"
            ? "Merged"
            : pr.state === "OPEN"
              ? "Open"
              : pr.state.charAt(0).toUpperCase() + pr.state.slice(1).toLowerCase()}
        </span>
      ) : null}
      <span className="notes-panel-meta">
        {pr
          ? `${pr.approvalCount} ${pr.approvalCount === 1 ? "approval" : "approvals"} · ${pr.commentCount} comments`
          : "Loading live details…"}
      </span>
      {pr?.url ? (
        <a href={pr.url} target="_blank" rel="noreferrer">
          Open in Bitbucket <ExternalLink size={10} />
        </a>
      ) : null}
      <button type="button" className="notes-panel-close" onClick={onClose} aria-label="Close pull request panel">
        <X size={13} />
      </button>
    </header>

    {isLoading ? (
      <div className="notes-panel-loading">
        <LoaderCircle className="notes-spinner" size={14} />
        Loading tasks and comments from Bitbucket…
      </div>
    ) : pr ? (
      <>
        {tasksForPanel.length ? (
          <div className="notes-pr-section">
            <h2>Tasks</h2>
            {tasksForPanel.map((task) => (
              <div className={`notes-pr-task${task.resolved ? " is-done" : ""}`} key={task.id}>
                <button
                  type="button"
                  className="notes-checkbox"
                  aria-label={task.resolved ? "Reopen task in Bitbucket" : "Resolve task in Bitbucket"}
                  aria-pressed={task.resolved}
                  disabled={isTaskPending(task.id)}
                  onClick={() => onToggleTask(task.id)}
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

        {pr.comments.length ? (
          <div className="notes-pr-section">
            <h2>Unresolved comments</h2>
            {pr.comments.map((comment) => {
              const todoText = commentTodoText(comment.authorDisplayName, comment.content);
              const added = hasTodoText(todoText);
              return (
                <div className="notes-pr-comment" key={comment.id}>
                  <span className="notes-avatar">{comment.authorInitials}</span>
                  <div>
                    <p>{comment.content}</p>
                    <span>
                      {comment.authorDisplayName}
                      {comment.path ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ""}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={added ? "is-added" : ""}
                    disabled={added}
                    onClick={() => onAddTodo(todoText)}
                  >
                    {added ? "Added ✓" : "+ to-do"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {allClear || (!pr.tasks.length && !pr.comments.length) ? (
          <div className="notes-pr-clear">
            <CheckCircle2 size={16} />
            No open tasks or unresolved comments.
          </div>
        ) : null}
      </>
    ) : (
      <div className="notes-panel-empty">
        <span>Pull request details are unavailable.</span>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    )}
    <footer>
      Live from Bitbucket — checking a task resolves it in the PR. Comments are copied only when you choose + to-do.
    </footer>
  </section>
);
