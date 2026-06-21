import { Loader2, Star } from "lucide-react";
import type { JiraTicket } from "../../shared/types";
import { formatHours } from "../utils/date";
import { EpicPill } from "./EpicPill";
import { TicketKeyLink } from "./TicketKeyLink";

interface TicketsViewProps {
  inProgress: JiraTicket[];
  recentlyClosed: JiraTicket[];
  favoriteKeys: string[];
  hoursByKey: Record<string, number>;
  weekHoursLogged: number;
  isConfigured: boolean;
  isLoading: boolean;
  error?: string;
  onToggleFavorite: (key: string) => void;
  onLog: (ticket: JiraTicket) => void;
}

const keyTone = (ticket: JiraTicket) => {
  if (ticket.statusCategory === "done") {
    return "is-muted";
  }
  return ticket.projectKey === "FTDM" ? "" : "is-amber";
};

const TicketRow = ({
  ticket,
  hours,
  isFavorite,
  onToggleFavorite,
  onLog
}: {
  ticket: JiraTicket;
  hours?: number;
  isFavorite: boolean;
  onToggleFavorite: (key: string) => void;
  onLog: (ticket: JiraTicket) => void;
}) => {
  const closed = ticket.statusCategory === "done";

  return (
    <div className={`ticket-row ${closed ? "is-closed" : ""}`}>
      <button
        type="button"
        className={`ticket-star ${isFavorite ? "active" : ""}`}
        onClick={() => onToggleFavorite(ticket.key)}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? `Unstar ${ticket.key}` : `Star ${ticket.key}`}
      >
        <Star size={13} fill={isFavorite ? "currentColor" : "none"} />
      </button>
      <TicketKeyLink
        issueKey={ticket.key}
        url={ticket.url}
        issueType={ticket.issueType}
        epic={ticket.epic}
        keyClassName={`ticket-key ${keyTone(ticket)}`}
        className="ticket-row-key"
      />
      <span className={`ticket-summary ${closed ? "is-closed" : ""}`} title={ticket.summary}>
        {ticket.summary}
      </span>
      <span className="ticket-project" title={ticket.epic?.summary ?? ticket.projectName}>
        {ticket.epic ? <EpicPill epic={ticket.epic} /> : ticket.projectName}
      </span>
      <span className={`ticket-hours ${!hours ? "is-dim" : ""}`}>{hours ? formatHours(hours) : "—"}</span>
      <button type="button" className={`ticket-log ${closed ? "ghost" : ""}`} onClick={() => onLog(ticket)}>
        LOG
      </button>
    </div>
  );
};

export const TicketsView = ({
  inProgress,
  recentlyClosed,
  favoriteKeys,
  hoursByKey,
  weekHoursLogged,
  isConfigured,
  isLoading,
  error,
  onToggleFavorite,
  onLog
}: TicketsViewProps) => {
  const favoriteSet = new Set(favoriteKeys);
  const byKey = new Map<string, JiraTicket>();
  for (const ticket of [...inProgress, ...recentlyClosed]) {
    byKey.set(ticket.key, ticket);
  }
  const favorites = favoriteKeys.map((key) => byKey.get(key)).filter((ticket): ticket is JiraTicket => Boolean(ticket));

  const renderRow = (ticket: JiraTicket) => (
    <TicketRow
      key={ticket.key}
      ticket={ticket}
      hours={hoursByKey[ticket.key]}
      isFavorite={favoriteSet.has(ticket.key)}
      onToggleFavorite={onToggleFavorite}
      onLog={onLog}
    />
  );

  return (
    <div className="view view-scroll">
      <div className="tickets-header">
        <div className="eyebrow">TICKETS</div>
        <div className="tickets-figure-row">
          <div className="big-figure">
            {inProgress.length} <span className="unit">assigned</span>
          </div>
          <span className="sub">· {formatHours(weekHoursLogged)} logged this week</span>
        </div>
        <div className="filter-row">
          <span className="filter-chip active">ASSIGNEE: ME</span>
          <span className="filter-chip">STATUS: OPEN</span>
          <div className="filter-spacer" />
          <span className="filter-chip muted">⌘K SEARCH</span>
        </div>
      </div>

      <div className="tickets-body">
        {!isConfigured ? (
          <div className="empty-note" style={{ padding: "28px 0" }}>
            Connect Jira in settings to load your assigned tickets.
          </div>
        ) : isLoading ? (
          <div className="empty-note" style={{ padding: "28px 0", display: "flex", gap: 8, alignItems: "center" }}>
            <Loader2 className="spin" size={14} /> Loading tickets…
          </div>
        ) : error ? (
          <div className="empty-note" style={{ padding: "28px 0", color: "#ff8b84" }}>
            {error}
          </div>
        ) : (
          <>
            {favorites.length > 0 && (
              <>
                <div className="group-label">★ FAVORITES</div>
                {favorites.map(renderRow)}
              </>
            )}

            <div className={`group-label ${favorites.length > 0 ? "spaced" : ""}`}>IN PROGRESS · ASSIGNED TO ME</div>
            {inProgress.length > 0 ? (
              inProgress.map(renderRow)
            ) : (
              <div className="empty-note" style={{ padding: "16px 0" }}>
                No open issues assigned to you.
              </div>
            )}

            {recentlyClosed.length > 0 && (
              <>
                <div className="group-label spaced">RECENTLY CLOSED</div>
                {recentlyClosed.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
