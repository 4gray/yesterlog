import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import type { JiraIssueDetails, OpenCursorPromptResult } from "../../shared/types";
import { formatClock, formatShortDate } from "../utils/date";
import { AdfRenderer } from "./AdfRenderer";
import { CursorGlyph } from "./CursorGlyph";
import { EpicPill } from "./EpicPill";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { TicketStatusBadge } from "./TicketStatusBadge";

export interface TicketDetailsDialogProps {
  issueKey: string;
  details?: JiraIssueDetails;
  localDetails?: JiraIssueDetails;
  weekLoggedSeconds: number;
  weekWorklogCount: number;
  weekRangeLabel: string;
  isLoading: boolean;
  error?: string;
  onClose: () => void;
  /** Opens Cursor with the ticket title + description prefilled as a chat prompt. */
  onOpenInCursor?: () => Promise<OpenCursorPromptResult>;
}

const formatCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const formatCreated = (createdAt?: string) => {
  if (!createdAt) {
    return "—";
  }

  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "—" : formatShortDate(date);
};

export const TicketDetailsDialog = ({
  issueKey,
  details,
  localDetails,
  weekLoggedSeconds,
  weekWorklogCount,
  weekRangeLabel,
  isLoading,
  error,
  onClose,
  onOpenInCursor
}: TicketDetailsDialogProps) => {
  const issue = details ?? localDetails;
  const description = details?.description?.trim() || localDetails?.description?.trim();
  const myTotalLabel = details ? formatClock(details.myLoggedSecondsTotal) : isLoading ? "Loading" : "—";
  const myTotalMeta = details ? formatCount(details.myWorklogCount, "worklog") : "Jira worklogs";

  const [isOpeningCursor, setIsOpeningCursor] = useState(false);
  const [cursorError, setCursorError] = useState<string>();

  // Reset the button's transient state whenever the dialog points at a new
  // ticket, so a stale error or spinner never carries over between tickets.
  useEffect(() => {
    setCursorError(undefined);
    setIsOpeningCursor(false);
  }, [issueKey]);

  const handleOpenInCursor = async () => {
    if (!onOpenInCursor || isOpeningCursor) {
      return;
    }

    setCursorError(undefined);
    setIsOpeningCursor(true);

    try {
      const result = await onOpenInCursor();
      if (!result.ok) {
        setCursorError(result.error || "Couldn't open Cursor.");
      }
    } catch {
      setCursorError("Couldn't open Cursor.");
    } finally {
      setIsOpeningCursor(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Ticket details for ${issueKey}`}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel ticket-details-panel">
        <div className="modal-head">
          <div className="modal-title-row">
            <span className="modal-title">Ticket details</span>
            <span className="modal-day">{issueKey}</span>
          </div>
          <div className="modal-head-actions">
            {isLoading ? <Loader2 className="spin" size={16} /> : null}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close ticket details">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="modal-body ticket-details-body">
          <div className="ticket-details-hero">
            <div>
              <div className="ticket-details-key">{issue?.key ?? issueKey}</div>
              <h2>{issue?.summary ?? "Loading Jira issue..."}</h2>
            </div>
            <div className="ticket-details-actions">
              {onOpenInCursor && issue ? (
                <button
                  type="button"
                  className="ticket-details-cursor"
                  onClick={handleOpenInCursor}
                  disabled={isOpeningCursor}
                  title="Send the ticket title & description to Cursor as a chat prompt"
                >
                  {isOpeningCursor ? <Loader2 className="spin" size={14} /> : <CursorGlyph size={14} />}
                  Open in Cursor
                </button>
              ) : null}
              {issue?.url ? (
                <a className="ticket-details-open" href={issue.url} target="_blank" rel="noreferrer">
                  Open in Jira
                  <ExternalLink size={14} strokeWidth={2} />
                </a>
              ) : null}
            </div>
          </div>

          {cursorError ? <div className="ticket-details-cursor-note">{cursorError}</div> : null}

          {error ? <div className="ticket-details-error">{error}</div> : null}

          <div className="ticket-details-stat-grid">
            <div className="ticket-details-stat">
              <span>This week</span>
              <strong>{formatClock(weekLoggedSeconds)}</strong>
              <em>{weekWorklogCount ? formatCount(weekWorklogCount, "worklog") : weekRangeLabel}</em>
            </div>
            <div className="ticket-details-stat">
              <span>My Jira total</span>
              <strong>{myTotalLabel}</strong>
              <em>{myTotalMeta}</em>
            </div>
            <div className="ticket-details-stat">
              <span>Issue total</span>
              <strong>{issue ? formatClock(issue.loggedSecondsTotal) : "—"}</strong>
              <em>Jira aggregate</em>
            </div>
          </div>

          <div className="ticket-details-meta">
            <div>
              <span>Status</span>
              <strong>
                <TicketStatusBadge statusName={issue?.statusName} statusCategory={issue?.statusCategory} />
              </strong>
            </div>
            <div>
              <span>Assignee</span>
              <strong>{issue?.assigneeDisplayName ?? "Unassigned"}</strong>
            </div>
            <div>
              <span>Project</span>
              <strong>{issue?.projectName ?? issueKey.split("-")[0]}</strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{issue?.issueType ? <IssueTypeBadge issueType={issue.issueType} /> : "—"}</strong>
            </div>
            <div>
              <span>Epic</span>
              <strong>{issue?.epic ? <EpicPill epic={issue.epic} /> : "—"}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{formatCreated(issue?.createdAt)}</strong>
            </div>
          </div>

          <div className="ticket-details-description">
            <div className="modal-label">DESCRIPTION</div>
            {details?.descriptionAdf ? (
              <AdfRenderer document={details.descriptionAdf} fallback={description} />
            ) : (
              <p>{description || (isLoading ? "Loading description..." : "No description available.")}</p>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <span className="modal-foot-hint">READ-ONLY JIRA DETAILS</span>
          <div className="modal-foot-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
