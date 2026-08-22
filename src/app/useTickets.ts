import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  JiraTicket,
  SearchTicketsRequest,
  SearchTicketsResult,
  TicketFilters,
  TicketSortMode,
  TicketsRequest,
  TicketsResult
} from "../../shared/types";
import type { DemoScenario } from "../demo/fixtures";
import { saveFavoriteKeys as saveFavoriteKeysToStorage } from "../storage/db";
import { nativeApi } from "../api/native";
import { compareTicketsByCreated, compareTicketsForView, isJiraConfigured } from "./appHelpers";

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

export const DEFAULT_TICKET_FILTERS: TicketFilters = {
  assignedOnly: true,
  statusCategories: ["new", "indeterminate", "done"],
  query: "",
  sortMode: "updatedDesc"
};

interface QueuedTicketLoad {
  settings: AppSettings;
  promise: Promise<TicketsResult | undefined>;
  resolve: (result: TicketsResult | undefined) => void;
}

const jiraIdentityKey = (settings: AppSettings) =>
  `${settings.jiraBaseUrl.trim().toLowerCase()}|${settings.jiraEmail.trim().toLowerCase()}`;

const filterTicketsForView = (
  source: TicketsResult,
  filters: TicketFilters,
  assignedDisplayName?: string
): TicketsResult => {
  const selectedStatuses = new Set(filters.statusCategories);
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  const includeTicket = (ticket: JiraTicket) =>
    selectedStatuses.has(ticket.statusCategory as "new" | "indeterminate" | "done") &&
    (!assignedDisplayName || ticket.assigneeDisplayName === assignedDisplayName) &&
    (normalizedQuery.length === 0 ||
      [ticket.key, ticket.summary, ticket.projectName, ticket.statusName, ticket.assigneeDisplayName ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery)
      ));
  const compareTickets = compareTicketsForView(filters.sortMode);

  return {
    ...source,
    inProgress: source.inProgress.filter(includeTicket).sort(compareTickets),
    recentlyClosed: source.recentlyClosed.filter(includeTicket).sort(compareTickets)
  };
};

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
  const [allAccessibleTickets, setAllAccessibleTickets] = useState<TicketsResult | undefined>();
  const [allAccessibleTicketsLoading, setAllAccessibleTicketsLoading] = useState(false);
  const [allAccessibleTicketsError, setAllAccessibleTicketsError] = useState<string | undefined>();
  const [ticketFilters, setTicketFiltersState] = useState<TicketFilters>(() => ({
    ...DEFAULT_TICKET_FILTERS,
    statusCategories: [...DEFAULT_TICKET_FILTERS.statusCategories]
  }));
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => demoScenario?.favoriteKeys ?? []);
  const [selectedTicket, setSelectedTicket] = useState<JiraTicket | undefined>(() => demoScenario?.selectedTicket);
  const ticketFiltersRef = useRef(ticketFilters);
  const ticketsRequestIdRef = useRef(0);
  const ticketsIdentityRef = useRef(
    demoScenario ? "demo" : jiraIdentityKey(settings)
  );
  const allAccessibleRequestIdRef = useRef(0);
  const ticketLoadsInFlightRef = useRef(new Map<string, Promise<TicketsResult | undefined>>());
  const queuedTicketLoadsRef = useRef(new Map<string, QueuedTicketLoad>());
  const beginTicketLoadRef = useRef<(settingsForLoad: AppSettings) => Promise<TicketsResult | undefined>>();

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

  const ticketViewTickets = useMemo(() => {
    const source = demoScenario?.tickets ?? (ticketFilters.assignedOnly ? tickets : allAccessibleTickets);
    if (!source) {
      return undefined;
    }

    const assignedDisplayName =
      demoScenario && ticketFilters.assignedOnly ? demoScenario.syncResult.displayName : undefined;
    return filterTicketsForView(source, ticketFilters, assignedDisplayName);
  }, [allAccessibleTickets, demoScenario, ticketFilters, tickets]);

  const loadAllAccessibleTickets = useCallback(
    async (settingsForLoad: AppSettings = settings) => {
      const requestId = allAccessibleRequestIdRef.current + 1;
      allAccessibleRequestIdRef.current = requestId;
      if (!isJiraConfigured(settingsForLoad)) {
        setAllAccessibleTickets(undefined);
        setAllAccessibleTicketsError(undefined);
        setAllAccessibleTicketsLoading(false);
        return undefined;
      }

      setAllAccessibleTicketsLoading(true);
      setAllAccessibleTicketsError(undefined);

      try {
        const result = await client.fetchAssignedTickets({ settings: settingsForLoad, assignedOnly: false });
        if (allAccessibleRequestIdRef.current === requestId) {
          setAllAccessibleTickets(result);
        }
        return result;
      } catch (error) {
        if (allAccessibleRequestIdRef.current === requestId) {
          setAllAccessibleTicketsError(error instanceof Error ? error.message : "Unable to load tickets.");
        }
        return undefined;
      } finally {
        if (allAccessibleRequestIdRef.current === requestId) {
          setAllAccessibleTicketsLoading(false);
        }
      }
    },
    [client, settings]
  );

  const performTicketLoad = useCallback(
    async (settingsForLoad: AppSettings = settings) => {
      const requestId = ticketsRequestIdRef.current + 1;
      ticketsRequestIdRef.current = requestId;
      const nextIdentity = jiraIdentityKey(settingsForLoad);
      const identityChanged = ticketsIdentityRef.current !== nextIdentity;
      ticketsIdentityRef.current = nextIdentity;
      if (identityChanged) {
        allAccessibleRequestIdRef.current += 1;
        setTickets(undefined);
        setSelectedTicket(undefined);
        setAllAccessibleTickets(undefined);
        setAllAccessibleTicketsError(undefined);
        setAllAccessibleTicketsLoading(false);
      }

      if (!isJiraConfigured(settingsForLoad)) {
        if (!identityChanged) {
          allAccessibleRequestIdRef.current += 1;
        }
        setTickets(undefined);
        setTicketsError(undefined);
        setTicketsLoading(false);
        setAllAccessibleTickets(undefined);
        setAllAccessibleTicketsError(undefined);
        setAllAccessibleTicketsLoading(false);
        return undefined;
      }

      setTicketsLoading(true);
      setTicketsError(undefined);

      try {
        const result = await client.fetchAssignedTickets({ settings: settingsForLoad });
        if (ticketsRequestIdRef.current !== requestId) {
          return undefined;
        }
        setTickets(result);
        setAllAccessibleTickets(undefined);
        if (!ticketFiltersRef.current.assignedOnly) {
          void loadAllAccessibleTickets(settingsForLoad);
        }
        return result;
      } catch (error) {
        if (ticketsRequestIdRef.current === requestId) {
          setTicketsError(error instanceof Error ? error.message : "Unable to load tickets.");
        }
        return undefined;
      } finally {
        if (ticketsRequestIdRef.current === requestId) {
          setTicketsLoading(false);
        }
      }
    },
    [client, loadAllAccessibleTickets, settings]
  );

  const beginTicketLoad = useCallback(
    (settingsForLoad: AppSettings): Promise<TicketsResult | undefined> => {
      const identity = jiraIdentityKey(settingsForLoad);
      let managedTask!: Promise<TicketsResult | undefined>;
      managedTask = (async () => {
        try {
          return await performTicketLoad(settingsForLoad);
        } finally {
          if (ticketLoadsInFlightRef.current.get(identity) !== managedTask) return;
          ticketLoadsInFlightRef.current.delete(identity);
          const queued = queuedTicketLoadsRef.current.get(identity);
          queuedTicketLoadsRef.current.delete(identity);
          if (queued) {
            const next = beginTicketLoadRef.current!(queued.settings);
            void next.then(queued.resolve);
          }
        }
      })();
      ticketLoadsInFlightRef.current.set(identity, managedTask);
      return managedTask;
    },
    [performTicketLoad]
  );

  beginTicketLoadRef.current = beginTicketLoad;

  const loadTickets = useCallback(
    (settingsForLoad: AppSettings = settings): Promise<TicketsResult | undefined> => {
      const identity = jiraIdentityKey(settingsForLoad);
      const current = ticketLoadsInFlightRef.current.get(identity);
      if (!current) {
        return beginTicketLoad(settingsForLoad);
      }

      const queued = queuedTicketLoadsRef.current.get(identity);
      if (queued) {
        queued.settings = settingsForLoad;
        return queued.promise;
      }

      let resolve!: (result: TicketsResult | undefined) => void;
      const promise = new Promise<TicketsResult | undefined>((promiseResolve) => {
        resolve = promiseResolve;
      });
      queuedTicketLoadsRef.current.set(identity, { settings: settingsForLoad, promise, resolve });
      return promise;
    },
    [beginTicketLoad, settings]
  );

  const setTicketFilters = useCallback(
    (nextFilters: TicketFilters) => {
      const next = {
        ...nextFilters,
        statusCategories: [...nextFilters.statusCategories]
      };
      ticketFiltersRef.current = next;
      setTicketFiltersState(next);

      if (
        !next.assignedOnly &&
        !demoScenario &&
        !allAccessibleTickets &&
        !allAccessibleTicketsLoading
      ) {
        void loadAllAccessibleTickets();
      }
    },
    [allAccessibleTickets, allAccessibleTicketsLoading, demoScenario, loadAllAccessibleTickets]
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
    ticketViewTickets,
    ticketFilters,
    setTicketFilters,
    ticketsLoading: ticketsLoading || (!ticketFilters.assignedOnly && allAccessibleTicketsLoading),
    ticketsError: ticketsError ?? (!ticketFilters.assignedOnly ? allAccessibleTicketsError : undefined),
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
