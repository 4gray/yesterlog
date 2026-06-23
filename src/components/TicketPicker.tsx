import { useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import {
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronDown,
  Loader2,
  Search,
  UserCheck,
  X
} from "lucide-react";
import type { JiraTicket, TicketSortMode } from "../../shared/types";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { TicketKeyLink } from "./TicketKeyLink";
import { TicketStatusBadge } from "./TicketStatusBadge";

export type TicketSearchHandler = (
  query: string,
  sortMode?: TicketSortMode,
  limit?: number,
  assignedOnly?: boolean,
  allowEmptyQuery?: boolean
) => Promise<JiraTicket[]>;

interface TicketPickerGroup {
  id: "search" | "options";
  label?: string;
  tickets: JiraTicket[];
}

const SORT_STORAGE_KEY = "timebro-ticket-picker-sort";
const ASSIGNED_FILTER_STORAGE_KEY = "timebro-ticket-picker-assigned-only";
const DEFAULT_SORT_MODE: TicketSortMode = "createdDesc";
const INITIAL_VISIBLE_TICKETS = 12;
const VISIBLE_TICKET_STEP = 12;
const INITIAL_SEARCH_LIMIT = 20;
const SEARCH_LIMIT_STEP = 20;
const MAX_SEARCH_LIMIT = 100;

const isTicketSortMode = (value: string | null): value is TicketSortMode =>
  value === "createdAsc" || value === "createdDesc";

const readStoredSortMode = (): TicketSortMode => {
  if (typeof window === "undefined") {
    return DEFAULT_SORT_MODE;
  }

  try {
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
    return isTicketSortMode(stored) ? stored : DEFAULT_SORT_MODE;
  } catch {
    return DEFAULT_SORT_MODE;
  }
};

const writeStoredSortMode = (sortMode: TicketSortMode) => {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
  } catch {
    // localStorage can be unavailable in restricted previews.
  }
};

const readStoredAssignedOnly = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(ASSIGNED_FILTER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeStoredAssignedOnly = (assignedOnly: boolean) => {
  try {
    window.localStorage.setItem(ASSIGNED_FILTER_STORAGE_KEY, String(assignedOnly));
  } catch {
    // localStorage can be unavailable in restricted previews.
  }
};

const createdTime = (ticket: JiraTicket) => {
  if (!ticket.createdAt) {
    return undefined;
  }

  const time = Date.parse(ticket.createdAt);
  return Number.isFinite(time) ? time : undefined;
};

export const sortTicketsForPicker = (tickets: JiraTicket[], sortMode: TicketSortMode) => {
  return [...tickets].sort((left, right) => {
    const leftTime = createdTime(left);
    const rightTime = createdTime(right);

    if (leftTime === undefined && rightTime === undefined) {
      return left.key.localeCompare(right.key);
    }

    if (leftTime === undefined) {
      return 1;
    }

    if (rightTime === undefined) {
      return -1;
    }

    return sortMode === "createdAsc"
      ? leftTime - rightTime || left.key.localeCompare(right.key)
      : rightTime - leftTime || left.key.localeCompare(right.key);
  });
};

export const limitTicketPickerGroups = (groups: TicketPickerGroup[], limit: number): TicketPickerGroup[] => {
  const visibleGroups: TicketPickerGroup[] = [];
  let remaining = Math.max(0, limit);

  for (const group of groups) {
    if (remaining <= 0) {
      break;
    }

    const tickets = group.tickets.slice(0, remaining);
    if (tickets.length > 0) {
      visibleGroups.push({ ...group, tickets });
      remaining -= tickets.length;
    }
  }

  return visibleGroups;
};

export const buildTicketPickerGroups = ({
  ticketOptions,
  searchResults,
  searchQuery,
  sortMode = DEFAULT_SORT_MODE
}: {
  ticketOptions: JiraTicket[];
  searchResults: JiraTicket[];
  searchQuery: string;
  sortMode?: TicketSortMode;
}): TicketPickerGroup[] => {
  const queryHasSearch = searchQuery.trim().length >= 2;
  const hasBrowseResults = searchQuery.trim().length === 0 && searchResults.length > 0;
  const searchKeys = new Set(searchResults.map((ticket) => ticket.key));
  const groups: TicketPickerGroup[] = [];

  if ((queryHasSearch || hasBrowseResults) && searchResults.length > 0) {
    groups.push({
      id: "search",
      label: queryHasSearch ? "JIRA SEARCH" : "JIRA TICKETS",
      tickets: sortTicketsForPicker(searchResults, sortMode)
    });
  }

  const optionTickets = queryHasSearch || hasBrowseResults
    ? ticketOptions.filter((ticket) => !searchKeys.has(ticket.key))
    : ticketOptions;

  if (optionTickets.length > 0) {
    groups.push({
      id: "options",
      label: (queryHasSearch || hasBrowseResults) && searchResults.length > 0 ? "ASSIGNED / FAVORITES" : undefined,
      tickets: sortTicketsForPicker(optionTickets, sortMode)
    });
  }

  return groups;
};

export const getTicketAssigneeLabel = (ticket: JiraTicket) =>
  `Assignee: ${ticket.assigneeDisplayName?.trim() || "Unassigned"}`;

interface TicketPickerItemProps {
  ticket: JiraTicket;
  activeTicketKey?: string;
  showAssignee: boolean;
  onSelect: (ticket: JiraTicket) => void;
}

export const TicketPickerItem = ({
  ticket,
  activeTicketKey,
  showAssignee,
  onSelect
}: TicketPickerItemProps) => (
  <button
    type="button"
    className={`ticket-picker-item ${ticket.key === activeTicketKey ? "active" : ""}`}
    onClick={() => onSelect(ticket)}
  >
    <span className="ticket-picker-key-stack">
      <span className="composer-target-key">{ticket.key}</span>
      <IssueTypeBadge issueType={ticket.issueType} />
    </span>
    <span className="ticket-picker-copy">
      <span className="ticket-picker-summary" title={ticket.summary}>
        {ticket.summary}
      </span>
      {showAssignee && <span className="ticket-picker-assignee">{getTicketAssigneeLabel(ticket)}</span>}
    </span>
    <TicketStatusBadge statusName={ticket.statusName} statusCategory={ticket.statusCategory} />
  </button>
);

interface TicketPickerProps {
  variant: "composer" | "modal";
  activeTicket?: JiraTicket;
  ticketOptions: JiraTicket[];
  isConfigured: boolean;
  emptyText: string;
  locked?: boolean;
  lockedTitle?: string;
  onSelect: (ticket: JiraTicket) => void;
  searchTickets?: TicketSearchHandler;
}

export const TicketPicker = ({
  variant,
  activeTicket,
  ticketOptions,
  isConfigured,
  emptyText,
  locked = false,
  lockedTitle,
  onSelect,
  searchTickets
}: TicketPickerProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<TicketSortMode>(() => readStoredSortMode());
  const [assignedOnly, setAssignedOnly] = useState(() => readStoredAssignedOnly());
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_TICKETS);
  const [searchLimit, setSearchLimit] = useState(INITIAL_SEARCH_LIMIT);
  const [searchResults, setSearchResults] = useState<JiraTicket[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [searchError, setSearchError] = useState<string | undefined>();
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const searchKeyRef = useRef("");
  const canSearch = Boolean(searchTickets) && isConfigured && !locked;
  const trimmedQuery = searchQuery.trim();
  const canBrowseWithoutQuery = trimmedQuery.length === 0;
  const canRunJiraSearch = canBrowseWithoutQuery || trimmedQuery.length >= 2;
  const rowClassName = variant === "modal" ? "modal-ticket-row" : "composer-target-row";
  const buttonClassName =
    variant === "modal" ? `modal-ticket ${locked ? "is-locked" : ""}` : "composer-target";
  const summaryClassName = variant === "modal" ? "modal-ticket-summary" : "composer-target-title";
  const groups = useMemo(
    () => buildTicketPickerGroups({ ticketOptions, searchResults, searchQuery, sortMode }),
    [searchQuery, searchResults, sortMode, ticketOptions]
  );
  const visibleGroups = useMemo(() => limitTicketPickerGroups(groups, visibleLimit), [groups, visibleLimit]);
  const totalTicketCount = groups.reduce((sum, group) => sum + group.tickets.length, 0);
  const visibleTicketCount = visibleGroups.reduce((sum, group) => sum + group.tickets.length, 0);
  const canRequestMoreSearchResults =
    canSearch &&
    canRunJiraSearch &&
    searchStatus !== "loading" &&
    searchResults.length >= searchLimit &&
    searchLimit < MAX_SEARCH_LIMIT;

  const selectSortMode = (nextSortMode: TicketSortMode) => {
    setSortMode(nextSortMode);
    writeStoredSortMode(nextSortMode);
  };

  const toggleAssignedOnly = () => {
    setAssignedOnly((current) => {
      const next = !current;
      writeStoredAssignedOnly(next);
      return next;
    });
  };

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    const onDocClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_TICKETS);
    setSearchLimit(INITIAL_SEARCH_LIMIT);
  }, [assignedOnly, pickerOpen, searchQuery, sortMode]);

  useEffect(() => {
    if (!pickerOpen || !canSearch || !searchTickets || !canRunJiraSearch) {
      searchRequestRef.current += 1;
      searchKeyRef.current = "";
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError(undefined);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    const requestKey = `${trimmedQuery}\u0000${sortMode}\u0000${assignedOnly ? "assigned" : "all"}`;
    const isNewSearch = searchKeyRef.current !== requestKey;
    searchRequestRef.current = requestId;
    searchKeyRef.current = requestKey;
    if (isNewSearch) {
      setSearchResults([]);
    }
    setSearchStatus("loading");
    setSearchError(undefined);

    const timeoutId = window.setTimeout(() => {
      searchTickets(trimmedQuery, sortMode, searchLimit, assignedOnly, canBrowseWithoutQuery)
        .then((issues) => {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          setSearchResults(issues);
          setSearchStatus("done");
        })
        .catch((error) => {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          setSearchResults([]);
          setSearchStatus("error");
          setSearchError(error instanceof Error ? error.message : "Unable to search Jira.");
        });
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [
    assignedOnly,
    canBrowseWithoutQuery,
    canRunJiraSearch,
    canSearch,
    pickerOpen,
    searchLimit,
    searchTickets,
    sortMode,
    trimmedQuery
  ]);

  const chooseTicket = (ticket: JiraTicket) => {
    onSelect(ticket);
    setPickerOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchStatus("idle");
    setSearchError(undefined);
  };

  const handlePickerScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceFromBottom > 72) {
      return;
    }

    if (visibleTicketCount < totalTicketCount) {
      setVisibleLimit((current) => Math.min(current + VISIBLE_TICKET_STEP, totalTicketCount));
    }

    if (canRequestMoreSearchResults) {
      setSearchLimit((current) => Math.min(current + SEARCH_LIMIT_STEP, MAX_SEARCH_LIMIT));
    }
  };

  const firstSearchResult = visibleGroups.find((group) => group.id === "search")?.tickets[0];

  return (
    <div className={variant === "modal" ? "modal-picker" : "composer-picker"} ref={pickerRef}>
      <div className={rowClassName}>
        {activeTicket ? (
          <TicketKeyLink
            issueKey={activeTicket.key}
            url={activeTicket.url}
            issueType={activeTicket.issueType}
            epic={activeTicket.epic}
            keyClassName="composer-target-key"
          />
        ) : null}
        <button
          type="button"
          className={buttonClassName}
          onClick={() => {
            if (!locked && isConfigured) {
              setPickerOpen((open) => !open);
            }
          }}
          disabled={!isConfigured}
          aria-disabled={locked}
          title={locked ? lockedTitle : undefined}
        >
          {activeTicket ? (
            <span className={summaryClassName}>{activeTicket.summary}</span>
          ) : (
            <span className={summaryClassName} style={{ color: "var(--dim-2)" }}>
              {isConfigured ? emptyText : "Connect Jira to choose a ticket"}
            </span>
          )}
          {!locked && <ChevronDown size={variant === "modal" ? 16 : 15} color="#5d636f" />}
        </button>
      </div>

      {!locked && pickerOpen && (
        <div className="ticket-picker">
          <div className="ticket-picker-head">
            {canSearch && (
              <div className="ticket-picker-search">
                <Search size={14} strokeWidth={1.9} />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      if (searchQuery) {
                        setSearchQuery("");
                      } else {
                        setPickerOpen(false);
                      }
                    }

                    if (event.key === "Enter" && firstSearchResult) {
                      event.preventDefault();
                      chooseTicket(firstSearchResult);
                    }
                  }}
                  placeholder="Search Jira by key or text"
                  aria-label="Search Jira issues"
                  autoFocus
                />
                {searchStatus === "loading" ? (
                  <Loader2 className="spin" size={14} />
                ) : searchQuery ? (
                  <button
                    type="button"
                    className="ticket-picker-clear"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchStatus("idle");
                      setSearchError(undefined);
                    }}
                    aria-label="Clear Jira search"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            )}

            <div className="ticket-picker-controls" aria-label="Ticket filter and sort controls">
              <button
                type="button"
                className={`ticket-picker-filter ${assignedOnly ? "active" : ""}`}
                aria-pressed={assignedOnly}
                title="Only Jira issues assigned to me"
                onClick={toggleAssignedOnly}
              >
                <UserCheck size={12} strokeWidth={2} />
                <span>Assigned to me</span>
              </button>

              <div className="ticket-picker-sort-control">
                <span className="ticket-picker-sort-label">Created</span>
                <div className="ticket-picker-sort" role="radiogroup" aria-label="Sort tickets by created date">
                  <button
                    type="button"
                    className={sortMode === "createdAsc" ? "active" : ""}
                    aria-pressed={sortMode === "createdAsc"}
                    title="Created date: oldest first"
                    onClick={() => selectSortMode("createdAsc")}
                  >
                    <CalendarArrowUp size={12} strokeWidth={2} />
                    <span>Oldest</span>
                  </button>
                  <button
                    type="button"
                    className={sortMode === "createdDesc" ? "active" : ""}
                    aria-pressed={sortMode === "createdDesc"}
                    title="Created date: newest first"
                    onClick={() => selectSortMode("createdDesc")}
                  >
                    <CalendarArrowDown size={12} strokeWidth={2} />
                    <span>Newest</span>
                  </button>
                </div>
              </div>
            </div>

            {trimmedQuery.length === 1 && <div className="ticket-picker-note">Type 2+ characters to search Jira.</div>}
            {searchStatus === "error" && <div className="ticket-picker-note is-error">{searchError}</div>}
            {trimmedQuery.length >= 2 && searchStatus === "done" && searchResults.length === 0 && (
              <div className="ticket-picker-note">No Jira matches for "{trimmedQuery}".</div>
            )}
          </div>

          <div className="ticket-picker-list" onScroll={handlePickerScroll}>
            {visibleGroups.length > 0 ? (
              visibleGroups.map((group) => (
                <div className="ticket-picker-group" key={group.id}>
                  {group.label && <div className="ticket-picker-label">{group.label}</div>}
                  {group.tickets.map((ticket) => (
                    <TicketPickerItem
                      key={`${group.id}-${ticket.key}`}
                      ticket={ticket}
                      activeTicketKey={activeTicket?.key}
                      showAssignee={!assignedOnly}
                      onSelect={chooseTicket}
                    />
                  ))}
                </div>
              ))
            ) : (
              <div className="ticket-picker-note">
                {canSearch ? "Search Jira to choose any ticket you can access." : emptyText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
