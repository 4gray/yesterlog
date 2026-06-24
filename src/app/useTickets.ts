import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  JiraTicket,
  SearchTicketsRequest,
  SearchTicketsResult,
  TicketSortMode,
  TicketsRequest,
  TicketsResult
} from "../../shared/types";
import type { DemoScenario } from "../demo/fixtures";
import { saveFavoriteKeys as saveFavoriteKeysToStorage } from "../storage/db";
import { nativeApi } from "../api/native";
import { compareTicketsByCreated, isJiraConfigured } from "./appHelpers";

export interface TicketsClient {
  fetchAssignedTickets(request: TicketsRequest): Promise<TicketsResult>;
  searchJiraTickets(request: SearchTicketsRequest): Promise<SearchTicketsResult>;
}

interface UseTicketsOptions {
  settings: AppSettings;
  isBooting: boolean;
  demoScenario?: Pick<DemoScenario, "tickets" | "favoriteKeys" | "selectedTicket" | "syncResult">;
  client?: TicketsClient;
  saveFavoriteKeys?: (keys: string[]) => Promise<void>;
}

export const useTickets = ({
  settings,
  isBooting,
  demoScenario,
  client = nativeApi,
  saveFavoriteKeys = saveFavoriteKeysToStorage
}: UseTicketsOptions) => {
  const [tickets, setTickets] = useState<TicketsResult | undefined>(() => demoScenario?.tickets);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | undefined>();
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => demoScenario?.favoriteKeys ?? []);
  const [selectedTicket, setSelectedTicket] = useState<JiraTicket | undefined>(() => demoScenario?.selectedTicket);

  const ticketOptions = useMemo(() => {
    const map = new Map<string, JiraTicket>();
    const all = [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])];
    if (selectedTicket) {
      map.set(selectedTicket.key, selectedTicket);
    }
    for (const key of favoriteKeys) {
      const ticket = all.find((candidate) => candidate.key === key);
      if (ticket) {
        map.set(key, ticket);
      }
    }
    for (const ticket of tickets?.inProgress ?? []) {
      map.set(ticket.key, ticket);
    }
    return [...map.values()];
  }, [favoriteKeys, selectedTicket, tickets]);

  const dockTickets = useMemo(() => {
    const byKey = new Map<string, JiraTicket>();
    for (const ticket of [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])]) {
      if (!byKey.has(ticket.key)) {
        byKey.set(ticket.key, ticket);
      }
    }
    return [...byKey.values()];
  }, [tickets]);

  const loadTickets = useCallback(
    async (settingsForLoad: AppSettings = settings) => {
      if (!isJiraConfigured(settingsForLoad)) {
        setTickets(undefined);
        setTicketsError(undefined);
        return undefined;
      }

      setTicketsLoading(true);
      setTicketsError(undefined);

      try {
        const result = await client.fetchAssignedTickets({ settings: settingsForLoad });
        setTickets(result);
        return result;
      } catch (error) {
        setTicketsError(error instanceof Error ? error.message : "Unable to load tickets.");
        return undefined;
      } finally {
        setTicketsLoading(false);
      }
    },
    [client, settings]
  );

  const searchTickets = useCallback(
    async (
      query: string,
      sortMode: TicketSortMode = "createdDesc",
      limit = 20,
      assignedOnly = false,
      allowEmptyQuery = false
    ) => {
      const normalizedQuery = query.trim().toLowerCase();
      const canBrowseWithoutQuery = allowEmptyQuery && normalizedQuery.length === 0;

      if (!isJiraConfigured(settings) || (normalizedQuery.length < 2 && !canBrowseWithoutQuery)) {
        return [];
      }

      if (demoScenario) {
        const allDemoTickets = [...demoScenario.tickets.inProgress, ...demoScenario.tickets.recentlyClosed];
        const demoTickets = assignedOnly
          ? allDemoTickets.filter((ticket) => ticket.assigneeDisplayName === demoScenario.syncResult.displayName)
          : allDemoTickets;
        const byKey = new Map<string, JiraTicket>();
        for (const ticket of demoTickets) {
          byKey.set(ticket.key, ticket);
        }

        const matches = canBrowseWithoutQuery
          ? [...byKey.values()]
          : [...byKey.values()].filter((ticket) =>
              [ticket.key, ticket.summary, ticket.projectName, ticket.statusName].some((value) =>
                value.toLowerCase().includes(normalizedQuery)
              )
            );

        return [...matches].sort(compareTicketsByCreated(sortMode)).slice(0, limit);
      }

      const result = await client.searchJiraTickets({
        settings,
        query,
        limit,
        sortMode,
        assignedOnly,
        allowEmptyQuery
      });
      return result.issues;
    },
    [client, demoScenario, settings]
  );

  const toggleFavorite = useCallback(
    (key: string) => {
      setFavoriteKeys((current) => {
        const next = current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key];
        if (!demoScenario) {
          void saveFavoriteKeys(next);
        }
        return next;
      });
    },
    [demoScenario, saveFavoriteKeys]
  );

  useEffect(() => {
    if (isBooting || demoScenario) {
      return;
    }

    void loadTickets();
  }, [demoScenario, isBooting, loadTickets]);

  return {
    tickets,
    ticketsLoading,
    ticketsError,
    favoriteKeys,
    setFavoriteKeys,
    selectedTicket,
    setSelectedTicket,
    ticketOptions,
    dockTickets,
    activeTicketCount: tickets?.inProgress.length ?? 0,
    loadTickets,
    searchTickets,
    toggleFavorite
  };
};
