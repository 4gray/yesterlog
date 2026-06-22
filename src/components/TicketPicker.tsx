import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { JiraTicket } from "../../shared/types";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { TicketKeyLink } from "./TicketKeyLink";

export type TicketSearchHandler = (query: string) => Promise<JiraTicket[]>;

interface TicketPickerGroup {
  id: "search" | "options";
  label?: string;
  tickets: JiraTicket[];
}

export const buildTicketPickerGroups = ({
  ticketOptions,
  searchResults,
  searchQuery
}: {
  ticketOptions: JiraTicket[];
  searchResults: JiraTicket[];
  searchQuery: string;
}): TicketPickerGroup[] => {
  const queryHasSearch = searchQuery.trim().length >= 2;
  const searchKeys = new Set(searchResults.map((ticket) => ticket.key));
  const groups: TicketPickerGroup[] = [];

  if (queryHasSearch && searchResults.length > 0) {
    groups.push({
      id: "search",
      label: "JIRA SEARCH",
      tickets: searchResults
    });
  }

  const optionTickets = queryHasSearch
    ? ticketOptions.filter((ticket) => !searchKeys.has(ticket.key))
    : ticketOptions;

  if (optionTickets.length > 0) {
    groups.push({
      id: "options",
      label: queryHasSearch && searchResults.length > 0 ? "ASSIGNED / FAVORITES" : undefined,
      tickets: optionTickets
    });
  }

  return groups;
};

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
  const [searchResults, setSearchResults] = useState<JiraTicket[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [searchError, setSearchError] = useState<string | undefined>();
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const canSearch = Boolean(searchTickets) && isConfigured && !locked;
  const trimmedQuery = searchQuery.trim();
  const rowClassName = variant === "modal" ? "modal-ticket-row" : "composer-target-row";
  const buttonClassName =
    variant === "modal" ? `modal-ticket ${locked ? "is-locked" : ""}` : "composer-target";
  const summaryClassName = variant === "modal" ? "modal-ticket-summary" : "composer-target-title";
  const groups = useMemo(
    () => buildTicketPickerGroups({ ticketOptions, searchResults, searchQuery }),
    [searchQuery, searchResults, ticketOptions]
  );

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
    if (!pickerOpen || !canSearch || !searchTickets || trimmedQuery.length < 2) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError(undefined);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchResults([]);
    setSearchStatus("loading");
    setSearchError(undefined);

    const timeoutId = window.setTimeout(() => {
      searchTickets(trimmedQuery)
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
  }, [canSearch, pickerOpen, searchTickets, trimmedQuery]);

  const chooseTicket = (ticket: JiraTicket) => {
    onSelect(ticket);
    setPickerOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchStatus("idle");
    setSearchError(undefined);
  };

  const firstSearchResult = searchResults[0];

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

          {trimmedQuery.length === 1 && <div className="ticket-picker-note">Type 2+ characters to search Jira.</div>}
          {searchStatus === "error" && <div className="ticket-picker-note is-error">{searchError}</div>}
          {trimmedQuery.length >= 2 && searchStatus === "done" && searchResults.length === 0 && (
            <div className="ticket-picker-note">No Jira matches for "{trimmedQuery}".</div>
          )}

          {groups.length > 0 ? (
            groups.map((group) => (
              <div className="ticket-picker-group" key={group.id}>
                {group.label && <div className="ticket-picker-label">{group.label}</div>}
                {group.tickets.map((ticket) => (
                  <button
                    key={`${group.id}-${ticket.key}`}
                    type="button"
                    className={`ticket-picker-item ${ticket.key === activeTicket?.key ? "active" : ""}`}
                    onClick={() => chooseTicket(ticket)}
                  >
                    <span className="composer-target-key">{ticket.key}</span>
                    <IssueTypeBadge issueType={ticket.issueType} />
                    <span className="ticket-picker-summary">{ticket.summary}</span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            <div className="ticket-picker-note">
              {canSearch ? "Search Jira to choose any ticket you can access." : emptyText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
