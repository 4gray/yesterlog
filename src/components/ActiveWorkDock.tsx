import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Hand, LayoutGrid, Plus } from "lucide-react";
import type { JiraTicket } from "../../shared/types";
import { formatHours } from "../utils/date";
import { buildDockColorMap, formatRelativeTime, getDockStatus } from "./activeWork";
import { EpicPill } from "./EpicPill";
import { getIssueTypeBadgeLabel } from "./IssueTypeBadge";

interface ActiveWorkDockProps {
  /** Ordered tickets — active/in-progress first, then recently closed. */
  tickets: JiraTicket[];
  /** Count shown in the header chip (active tickets). */
  activeCount: number;
  open: boolean;
  shownCount: number;
  draggingKey: string | null;
  now: Date;
  onToggleOpen: () => void;
  onLoadMore: () => void;
  onGrabCard: (ticket: JiraTicket, event: React.MouseEvent) => void;
}

const STATUS_LABELS: Record<string, string> = {
  progress: "IN PROGRESS",
  review: "IN REVIEW",
  done: "DONE",
  new: "TODO"
};

const DockCard = ({
  ticket,
  color,
  isDragging,
  now,
  onGrabCard
}: {
  ticket: JiraTicket;
  color: { seg: string; text: string };
  isDragging: boolean;
  now: Date;
  onGrabCard: (ticket: JiraTicket, event: React.MouseEvent) => void;
}) => {
  const status = getDockStatus(ticket);
  const badge = getIssueTypeBadgeLabel(ticket.issueType);
  const isDone = status.tone === "done";
  const createdRelative = formatRelativeTime(ticket.createdAt, now);
  const loggedHours = ticket.loggedSecondsTotal / 3600;

  return (
    <div
      className={`dock-card ${isDragging ? "is-dragging" : ""} ${isDone ? "is-done" : ""}`}
      onMouseDown={(event) => onGrabCard(ticket, event)}
      role="button"
      tabIndex={0}
      aria-label={`Drag ${ticket.key} onto a day to log time`}
      title={`${ticket.key} — ${ticket.summary}`}
    >
      <div className="dock-card-top">
        <span className="dock-card-dot" style={{ background: color.seg }} />
        <span className="dock-card-key" style={{ color: color.text }}>
          {ticket.key}
        </span>
        {badge && <span className={`dock-card-badge is-${badge.toLowerCase()}`}>{badge}</span>}
        <span className="dock-card-spacer" />
        <span className={`dock-card-status is-${status.tone}`} title={`Jira status: ${status.label}`}>
          {STATUS_LABELS[status.tone] ?? status.label.toUpperCase()}
        </span>
      </div>

      <div className="dock-card-title">{ticket.summary}</div>

      <div className="dock-card-meta">
        {ticket.epic ? (
          <EpicPill epic={ticket.epic} className="dock-card-epic" />
        ) : (
          <span className="dock-card-project">
            <span className="dock-card-diamond" />
            {ticket.projectName}
          </span>
        )}
        <span className="dock-card-spacer" />
        {loggedHours > 0.01 && <span className="dock-card-logged">{formatHours(loggedHours)} logged</span>}
        {createdRelative && <span className="dock-card-activity">{createdRelative}</span>}
      </div>
    </div>
  );
};

export const ActiveWorkDock = ({
  tickets,
  activeCount,
  open,
  shownCount,
  draggingKey,
  now,
  onToggleOpen,
  onLoadMore,
  onGrabCard
}: ActiveWorkDockProps) => {
  if (tickets.length === 0) {
    return null;
  }

  const railRef = useRef<HTMLDivElement | null>(null);

  // Translate vertical wheel scrolling into horizontal movement of the rail.
  // Registered natively (non-passive) so preventDefault actually stops the
  // page from scrolling; horizontal/trackpad gestures pass through untouched.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      const maxScroll = rail.scrollWidth - rail.clientWidth;
      if (maxScroll <= 0) {
        return;
      }
      const atStart = rail.scrollLeft <= 0;
      const atEnd = rail.scrollLeft >= maxScroll - 1;
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) {
        return;
      }
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, [open]);

  const colorMap = buildDockColorMap(tickets);
  const shown = Math.min(shownCount, tickets.length);
  const visible = tickets.slice(0, shown);
  const remaining = tickets.length - shown;

  if (!open) {
    return (
      <button type="button" className="dock-collapsed" onClick={onToggleOpen}>
        <LayoutGrid size={15} strokeWidth={1.8} className="dock-collapsed-icon" />
        <span className="dock-collapsed-title">MY ACTIVE WORK</span>
        <span className="dock-count">{activeCount}</span>
        <span className="dock-collapsed-hint">— drag a ticket onto a day to log time</span>
        <span className="dock-card-spacer" />
        <ChevronUp size={15} strokeWidth={2} className="dock-collapsed-icon" />
      </button>
    );
  }

  return (
    <div className="active-dock">
      <div className="dock-head">
        <span className="dock-head-title">MY ACTIVE WORK</span>
        <span className="dock-count">{activeCount}</span>
        <span className="dock-head-hint">
          <Hand size={12} strokeWidth={1.8} />
          drag a card onto a day to log
        </span>
        <span className="dock-card-spacer" />
        <button type="button" className="dock-hide" onClick={onToggleOpen} title="Hide panel" aria-label="Hide active work panel">
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="dock-rail" ref={railRef}>
        {visible.map((ticket) => (
          <DockCard
            key={ticket.key}
            ticket={ticket}
            color={colorMap.get(ticket.key) ?? { seg: "#5b8cff", text: "#8fb0ff" }}
            isDragging={draggingKey === ticket.key}
            now={now}
            onGrabCard={onGrabCard}
          />
        ))}
        {remaining > 0 && (
          <button type="button" className="dock-load-more" onClick={onLoadMore}>
            <Plus size={18} strokeWidth={1.9} />
            <span className="dock-load-more-label">Load more</span>
            <span className="dock-load-more-count">+{remaining} more</span>
          </button>
        )}
      </div>

      <div className="dock-rail-fade" aria-hidden="true" />
    </div>
  );
};
