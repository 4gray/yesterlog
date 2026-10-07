import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings } from "../../shared/types";
import {
  analyticsConnectionKey,
  analyticsRepositories,
  ALL_ANALYTICS_REPOSITORIES,
  analyticsUserKey,
  type PrAnalyticsProgress,
  type PrAnalyticsRepository
} from "../../shared/prAnalytics";
import { nativeApi } from "../api/native";
import { getPrAnalyticsCache, savePrAnalyticsRepository } from "../storage/db";
import { demoPrAnalytics } from "../demo/prAnalytics";
import type { AnalyticsRange } from "../domain/prAnalytics";

export async function prAnalyticsCacheKey(settings: AppSettings) {
  // Token rotation cannot accidentally display another account's cached personal scope.
  // Persist only a one-way fingerprint, never credentials, in the analytics store.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(settings.bitbucketApiToken.trim())
  );
  return JSON.stringify([
    analyticsConnectionKey(settings),
    Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("")
  ]);
}
export function usePrAnalytics(settings: AppSettings, range: AnalyticsRange, isDemo: boolean) {
  const connection = analyticsConnectionKey(settings);
  const scope = JSON.stringify([connection, settings.bitbucketApiToken, settings.bitbucketRepositories]);
  const [state, setState] = useState<{
    scope: string;
    results: PrAnalyticsRepository[];
  }>({ scope, results: [] });
  const [loadingCache, setLoadingCache] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<PrAnalyticsProgress>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const current = useRef({ generation: 0, id: "", cancelled: false });
  const repositories = useMemo(
    () => analyticsRepositories(settings.bitbucketRepositories),
    [settings.bitbucketRepositories]
  );
  const start = range.start.toISOString(),
    end = range.end.toISOString();
  const demo = useMemo(
    () =>
      isDemo
        ? demoPrAnalytics(settings, {
            start: new Date(start),
            end: new Date(end)
          })
        : [],
    [isDemo, start, end, settings]
  );
  const results = isDemo ? demo : state.scope === scope ? state.results : [];
  const resultsRef = useRef(results);
  resultsRef.current = results;

  useEffect(() => {
    current.current.generation++;
    let disposed = false;
    current.current.cancelled = false;
    setErrors({});
    setProgress(undefined);
    setSyncing(false);
    setLoadingCache(true);
    if (isDemo) {
      setLoadingCache(false);
      return;
    }
    void prAnalyticsCacheKey(settings)
      .then(getPrAnalyticsCache)
      .then((cache) => {
        if (!disposed) setState({ scope, results: cache?.repositories ?? [] });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setErrors({
            cache: error instanceof Error ? error.message : "Could not read the local cache."
          });
      })
      .finally(() => {
        if (!disposed) setLoadingCache(false);
      });
    return () => {
      disposed = true;
      current.current.generation++;
      if (current.current.id) void nativeApi.cancelPrAnalytics(current.current.id);
      current.current.id = "";
    };
    // scope contains every relevant connection field; unrelated settings do not reset a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, isDemo]);
  useEffect(
    () =>
      nativeApi.onPrAnalyticsProgress((value) => {
        if (value.requestId === current.current.id) setProgress(value);
      }),
    []
  );
  useEffect(() => {
    // A changed date range invalidates in-flight work, but never erases the last cached range.
    return () => {
      current.current.generation++;
      if (current.current.id) void nativeApi.cancelPrAnalytics(current.current.id);
      current.current.id = "";
      setSyncing(false);
      setProgress(undefined);
    };
  }, [start, end]);

  const refresh = useCallback(
    async (repository: string) => {
      if (isDemo || current.current.id || loadingCache) return;
      const generation = ++current.current.generation;
      current.current.id = "connecting";
      current.current.cancelled = false;
      setSyncing(true);
      setErrors({});
      setProgress(undefined);
      try {
        const cacheKey = await prAnalyticsCacheKey(settings);
        for (const name of repositories.filter((r) => repository === ALL_ANALYTICS_REPOSITORIES || r === repository)) {
          if (current.current.cancelled || generation !== current.current.generation) break;
          const id = crypto.randomUUID();
          current.current.id = id;
          try {
            const result = await nativeApi.syncPrAnalytics({
              settings,
              repository: name,
              rangeStart: start,
              rangeEnd: end,
              requestId: id,
              previous: resultsRef.current.find((r) => r.repository === name)
            });
            if (generation !== current.current.generation) break;
            const accountKey = analyticsUserKey(result.user);
            const prior = resultsRef.current.filter(
              (r) => analyticsUserKey(r.user) === accountKey && r.repository !== name
            );
            const next = [...prior, result];
            resultsRef.current = next;
            setState({ scope, results: next });
            await savePrAnalyticsRepository(cacheKey, result);
          } catch (error) {
            if (generation === current.current.generation)
              setErrors((value) => ({
                ...value,
                [name]: error instanceof Error ? error.message : "Could not load this repository."
              }));
          } finally {
            if (current.current.id === id) current.current.id = "";
          }
        }
      } catch (error) {
        if (generation === current.current.generation)
          setErrors({
            cache: error instanceof Error ? error.message : "Could not save analytics."
          });
      } finally {
        if (generation === current.current.generation) {
          current.current.id = "";
          setSyncing(false);
          setProgress(undefined);
        }
      }
    },
    [isDemo, loadingCache, settings, repositories, start, end, scope]
  );
  const cancel = () => {
    current.current.cancelled = true;
    if (current.current.id) void nativeApi.cancelPrAnalytics(current.current.id);
  };
  return {
    results,
    loadingCache,
    syncing,
    progress,
    errors,
    refresh,
    cancel,
    repositories
  };
}
