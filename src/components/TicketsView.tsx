import { ArrowDownUp, Check, Loader2, Search, Star, UserRound, X } from "lucide-react";
import type {
  JiraTicket,
  TicketFilters,
  TicketFilterStatusCategory,
  TicketViewSortMode
} from "../../shared/types";
import { compareTicketsForView } from "../app/appHelpers";
import { formatHours } from "../utils/date";
import { EpicPill } from "./EpicPill";
import { TicketKeyLink } from "./TicketKeyLink";
import { TicketStatusBadge } from "./TicketStatusBadge";

interface TicketsViewProps {
  inProgress: JiraTicket[];
  recentlyClosed: JiraTicket[];
  favoriteKeys: string[];
  hoursByKey: Record<string, number>;
  weekHoursLogged: number;
  isConfigured: boolean;
  isLoading: boolean;
  error?: string;
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  onToggleFavorite: (key: string) => void;
  onLog: (ticket: JiraTicket) => void;
}

const STATUS_FILTERS: Array<{
  value: TicketFilterStatusCategory;
  label: string;
  tone: string;
}> = [
  { value: "new", label: "To do", tone: "todo" },
  { value: "indeterminate", label: "In progress", tone: "progress" },
  { value: "done", label: "Done", tone: "done" }
];

const keyTone = (ticket: JiraTicket) => {
  if (ticket.statusCategory === "done") {
    return "is-muted";
  }
  return ticket.projectKey === "TBRO" ? "" : "is-amber";
};

const TicketRow = ({
  ticket,
  hours,
  isFavorite,
  showAssignee,
  onToggleFavorite,
  onLog
}: {
  ticket: JiraTicket;
  hours?: number;
  isFavorite: boolean;
  showAssignee: boolean;
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
      <div className="ticket-copy">
        <span className={`ticket-summary ${closed ? "is-closed" : ""}`} title={ticket.summary}>
          {ticket.summary}
        </span>
        <div className="ticket-row-meta">
          <TicketStatusBadge
            statusName={ticket.statusName}
            statusCategory={ticket.statusCategory}
            className="ticket-row-status"
          />
          <span className="ticket-project" title={ticket.epic?.summary ?? ticket.projectName}>
            {ticket.epic ? <EpicPill epic={ticket.epic} /> : ticket.projectName}
          </span>
          {showAssignee ? (
            <span className="ticket-assignee" title={ticket.assigneeDisplayName?.trim() || "Unassigned"}>
              <UserRound size={10} aria-hidden="true" />
              <span>{ticket.assigneeDisplayName?.trim() || "Unassigned"}</span>
            </span>
          ) : null}
        </div>
      </div>
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
  filters,
  onFiltersChange,
  onToggleFavorite,
  onLog
}: TicketsViewProps) => {
  const favoriteSet = new Set(favoriteKeys);
  const compareTickets = compareTicketsForView(filters.sortMode);
  const allVisibleTickets = [...inProgress, ...recentlyClosed];
  const favorites = allVisibleTickets.filter((ticket) => favoriteSet.has(ticket.key)).sort(compareTickets);
  const toDoTickets = inProgress.filter(
    (ticket) => ticket.statusCategory === "new" && !favoriteSet.has(ticket.key)
  );
  const activeTickets = inProgress.filter(
    (ticket) => ticket.statusCategory === "indeterminate" && !favoriteSet.has(ticket.key)
  );
  const doneTickets = recentlyClosed.filter((ticket) => !favoriteSet.has(ticket.key));
  const visibleTicketCount = inProgress.length + recentlyClosed.length;

  const toggleStatus = (status: TicketFilterStatusCategory) => {
    const nextSelected = new Set(filters.statusCategories);
    if (nextSelected.has(status)) {
      nextSelected.delete(status);
    } else {
      nextSelected.add(status);
    }

    onFiltersChange({
      ...filters,
      statusCategories: STATUS_FILTERS.map((option) => option.value).filter((value) => nextSelected.has(value))
    });
  };

  const renderRow = (ticket: JiraTicket) => (
    <TicketRow
      key={ticket.key}
      ticket={ticket}
      hours={hoursByKey[ticket.key]}
      isFavorite={favoriteSet.has(ticket.key)}
      showAssignee={!filters.assignedOnly}
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
            {visibleTicketCount}{" "}
            <span className="unit">
              {filters.query.trim() ? (visibleTicketCount === 1 ? "match" : "matches") : visibleTicketCount === 1 ? "issue" : "issues"}
            </span>
          </div>
          <span className="sub">
            {filters.assignedOnly ? "assigned to you" : "visible across Jira"} · {formatHours(weekHoursLogged)} logged this week
          </span>
        </div>
        <div className="ticket-filter-rail" aria-label="Ticket filters">
          <div className="ticket-filter-group">
            <span className="ticket-filter-label">ASSIGNEE</span>
            <button
              type="button"
              className={`filter-chip filter-chip-assignee ${filters.assignedOnly ? "active" : ""}`}
              aria-pressed={filters.assignedOnly}
              disabled={!isConfigured}
              onClick={() => onFiltersChange({ ...filters, assignedOnly: !filters.assignedOnly })}
              title={filters.assignedOnly ? "Show tickets across assignees" : "Only show tickets assigned to me"}
            >
              <UserRound size={13} aria-hidden="true" />
              <span>Assigned to me</span>
              <span className="filter-chip-check" aria-hidden="true">
                {filters.assignedOnly ? <Check size={10} strokeWidth={3} /> : null}
              </span>
            </button>
          </div>

          <div className="ticket-filter-divider" aria-hidden="true" />

          <div className="ticket-filter-group ticket-status-filters">
            <span className="ticket-filter-label">STATUS</span>
            <div className="ticket-status-options">
              {STATUS_FILTERS.map((option) => {
                const isSelected = filters.statusCategories.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`filter-chip status-${option.tone} ${isSelected ? "active" : ""}`}
                    aria-pressed={isSelected}
                    disabled={!isConfigured}
                    onClick={() => toggleStatus(option.value)}
                  >
                    <span className="ticket-status-dot" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ticket-tools">
          <div className="ticket-search-control" role="search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={filters.query}
              aria-label="Search tickets"
              placeholder="Search key, summary, status…"
              disabled={!isConfigured}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            />
            {filters.query ? (
              <button
                type="button"
                className="ticket-search-clear"
                aria-label="Clear ticket search"
                onClick={() => onFiltersChange({ ...filters, query: "" })}
              >
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <label className="ticket-sort-control">
            <ArrowDownUp size={13} aria-hidden="true" />
            <span>SORT</span>
            <select
              value={filters.sortMode}
              aria-label="Sort tickets"
              disabled={!isConfigured}
              onChange={(event) =>
                onFiltersChange({ ...filters, sortMode: event.target.value as TicketViewSortMode })
              }
            >
              <option value="updatedDesc">Recently updated</option>
              <option value="createdDesc">Newest created</option>
              <option value="createdAsc">Oldest created</option>
              <option value="keyAsc">Key A–Z</option>
            </select>
          </label>
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
                <div className="group-label">★ FAVORITES · {favorites.length}</div>
                {favorites.map(renderRow)}
              </>
            )}

            {visibleTicketCount === 0 ? (
              <div className="empty-note" style={{ padding: "16px 0" }}>
                {filters.statusCategories.length === 0
                  ? "Select at least one status to show tickets."
                  : filters.query.trim()
                    ? `No tickets match “${filters.query.trim()}”.`
                  : "No tickets match these filters."}
              </div>
            ) : null}

            {toDoTickets.length > 0 && (
              <>
                <div className={`group-label ${favorites.length > 0 ? "spaced" : ""}`}>TO DO · {toDoTickets.length}</div>
                {toDoTickets.map(renderRow)}
              </>
            )}

            {activeTickets.length > 0 && (
              <>
                <div className={`group-label ${favorites.length > 0 || toDoTickets.length > 0 ? "spaced" : ""}`}>
                  IN PROGRESS · {activeTickets.length}
                </div>
                {activeTickets.map(renderRow)}
              </>
            )}

            {doneTickets.length > 0 && (
              <>
                <div className="group-label spaced">DONE · LAST 14 DAYS · {doneTickets.length}</div>
                {doneTickets.map(renderRow)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
