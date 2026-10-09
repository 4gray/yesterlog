import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, GitPullRequest, RefreshCw, Search, X } from "lucide-react";
import type { AppSettings } from "../../shared/types";
import { ALL_ANALYTICS_REPOSITORIES, analyticsConnectionKey } from "../../shared/prAnalytics";
import { usePrAnalytics } from "../app/usePrAnalytics";
import {
  analyticsCohort,
  analyticsRange,
  buildPrAnalytics,
  elapsedHours,
  formatAnalyticsDuration as duration,
  type AnalyticsAuthor,
  type AnalyticsCohort,
  type AnalyticsGrouping,
  type AnalyticsPeriod
} from "../domain/prAnalytics";
import { addDays, toLocalDateKey } from "../utils/date";
import { PrAnalyticsPeriodPicker } from "./PrAnalyticsPeriodPicker";
import { PrAnalyticsComparison } from "./PrAnalyticsComparison";
import { PrReviewFlow } from "./PrReviewFlow";
import { customAnalyticsRange, previousAnalyticsRange } from "../domain/prAnalyticsPeriods";
import { reviewFlowEvidence } from "../domain/prReviewFlow";
import { demoPrAnalytics } from "../demo/prAnalytics";

interface Props {
  settings: AppSettings;
  currentDate: Date;
  isDemo?: boolean;
}
interface Preferences {
  repository: string;
  author: AnalyticsAuthor;
  period: AnalyticsPeriod | "custom";
  customFrom?: string;
  customTo?: string;
  compare?: string;
  grouping: AnalyticsGrouping;
}
const defaults: Preferences = {
  repository: ALL_ANALYTICS_REPOSITORIES,
  author: "me",
  period: "12w",
  grouping: "week"
};
const preferenceKey = (settings: AppSettings) => `yesterlog:pr-analytics:${analyticsConnectionKey(settings)}`;
const loadPreferences = (settings: AppSettings, demo: boolean): Preferences => {
  try {
    const value = demo ? {} : JSON.parse(localStorage.getItem(preferenceKey(settings)) ?? "{}");
    return {
      repository: typeof value.repository === "string" ? value.repository : ALL_ANALYTICS_REPOSITORIES,
      author: value.author === "all" ? "all" : "me",
      period: ["4w", "12w", "6m", "12m", "custom"].includes(value.period) ? value.period : "12w",
      customFrom: typeof value.customFrom === "string" ? value.customFrom : undefined,
      customTo: typeof value.customTo === "string" ? value.customTo : undefined,
      compare: typeof value.compare === "string" ? value.compare : undefined,
      grouping: value.grouping === "month" ? "month" : "week"
    };
  } catch {
    return defaults;
  }
};
const dateLabel = (at?: string) =>
  at
    ? new Date(at).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "Unavailable";

export const PrAnalyticsView = (props: Props) => (
  <AnalyticsOverview key={analyticsConnectionKey(props.settings)} {...props} />
);
function AnalyticsOverview({ settings, currentDate, isDemo = false }: Props) {
  const [preferences, setPreferences] = useState(() => loadPreferences(settings, isDemo));
  const { author, period, grouping } = preferences;
  const range = useMemo(
    () =>
      period === "custom"
        ? (customAnalyticsRange(preferences.customFrom ?? "", preferences.customTo ?? "", currentDate)
            .range ?? analyticsRange(currentDate, "12w"))
        : analyticsRange(currentDate, period),
    [currentDate, period, preferences.customFrom, preferences.customTo]
  );
  const previousRange = useMemo(() => previousAnalyticsRange(range), [range]);
  const source = usePrAnalytics(settings, range, isDemo);
  const repository = source.repositories.includes(preferences.repository)
    ? preferences.repository
    : ALL_ANALYTICS_REPOSITORIES;
  const report = useMemo(
    () => buildPrAnalytics(source.results, source.repositories, repository, author, range, grouping),
    [source.results, source.repositories, repository, author, range, grouping]
  );
  const comparisonRepository =
    repository !== ALL_ANALYTICS_REPOSITORIES &&
    preferences.compare !== repository &&
    source.repositories.includes(preferences.compare ?? "")
      ? preferences.compare
      : undefined;
  const comparisonReport = useMemo(
    () =>
      comparisonRepository
        ? buildPrAnalytics(source.results, source.repositories, comparisonRepository, author, range, grouping)
        : undefined,
    [source.results, source.repositories, comparisonRepository, author, range, grouping]
  );
  const previousReport = useMemo(
    () =>
      buildPrAnalytics(
        isDemo ? demoPrAnalytics(settings, previousRange) : source.results,
        source.repositories,
        repository,
        author,
        previousRange,
        grouping
      ),
    [isDemo, settings, source.results, source.repositories, repository, author, previousRange, grouping]
  );
  const evidence = useMemo(
    () => reviewFlowEvidence(report, previousReport, range, previousRange, currentDate),
    [report, previousReport, range, previousRange, currentDate]
  );
  const refreshScope = comparisonRepository ? [repository, comparisonRepository] : repository;
  const analysisKey = JSON.stringify([
    repository,
    author,
    +range.start,
    +range.end,
    settings.aiEnabled,
    settings.aiProvider,
    settings.ollamaEndpoint,
    settings.ollamaModel,
    settings.claudeModel,
    settings.claudeCliPath,
    settings.codexModel,
    settings.codexCliPath,
    settings.bitbucketApiToken,
    source.syncing,
    evidence.payload,
    source.results.map((r) => [r.repository, r.syncedAt])
  ]);
  const [cohort, setCohort] = useState<AnalyticsCohort>("created");
  const [bucketKey, setBucketKey] = useState<string>();
  const [chart, setChart] = useState<"throughput" | "comments" | "merge" | "response" | "review">(
    "throughput"
  );
  const [search, setSearch] = useState("");
  const [tooltip, setTooltip] = useState<{ key: string; x: number }>();
  const tooltipId = useId();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string>();
  useEffect(() => {
    if (!isDemo) {
      try {
        localStorage.setItem(preferenceKey(settings), JSON.stringify(preferences));
      } catch {
        /* Optional preferences must not block the report. */
      }
    }
  }, [preferences, settings, isDemo]);
  useEffect(() => {
    setBucketKey(undefined);
    setTooltip(undefined);
    setPage(0);
    setExpanded(undefined);
  }, [repository, author, period, grouping, +range.start, +range.end]);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPreferences((p) => ({ ...p, [key]: value }));
  const selectedBucket = report.buckets.find((b) => b.key === bucketKey);
  const tableRange = selectedBucket?.range ?? range;
  const cohortRows = analyticsCohort(report.prs, tableRange, cohort).sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
  const query = search.trim().toLocaleLowerCase();
  const rows = cohortRows.filter(
    (p) =>
      !query ||
      p.title.toLocaleLowerCase().includes(query) ||
      (query.startsWith("#") ? `#${p.id}`.includes(query) : String(p.id).includes(query))
  );
  const searchPrs = (value: string) => {
    setSearch(value);
    setPage(0);
    setExpanded(undefined);
  };
  const hoveredBucket = report.buckets.find((b) => b.key === tooltip?.key);
  const pageCount = Math.max(1, Math.ceil(rows.length / 15)),
    activePage = Math.min(page, pageCount - 1);
  const hasData = report.coverage.some((c) => c.coversRange);
  const partial = hasData && !report.complete;
  const stale =
    report.coverage.some((c) => c.result && Date.now() - Date.parse(c.result.syncedAt) > 86400000) && !isDemo;
  const maxBar = Math.max(
    1,
    ...report.buckets.flatMap((b) =>
      chart === "throughput"
        ? [b.created, b.merged]
        : chart === "comments"
          ? [b.comments]
          : [b[chart].median ?? 0]
    )
  );
  const chooseCohort = (next: AnalyticsCohort) => {
    setCohort(next);
    setPage(0);
    setExpanded(undefined);
  };
  const count = (value: number) => (hasData ? `${partial ? "≥ " : ""}${value}` : "—");
  const rangeLabel = `${range.start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${addDays(range.end, -1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    <section className="pr-analytics" aria-labelledby="pr-analytics-title">
      <header className="pa-header">
        <div>
          <div className="pa-eyebrow">
            <GitPullRequest size={14} /> BITBUCKET {isDemo && <span className="pa-badge">Sample data</span>}
          </div>
          <h1 id="pr-analytics-title">Pull request analytics</h1>
          <p>See how work moves from a pull request to a merge.</p>
        </div>
        <button
          className="pa-button"
          type="button"
          disabled={source.loadingCache || isDemo || !source.repositories.length}
          onClick={() => (source.syncing ? source.cancel() : void source.refresh(refreshScope))}
        >
          {source.syncing ? <X size={14} /> : <RefreshCw size={14} />}
          {source.syncing ? "Stop sync" : "Refresh"}
        </button>
      </header>
      <div className="pa-filters">
        <label>
          Repository
          <select value={repository} onChange={(e) => change("repository", e.target.value)}>
            <option value={ALL_ANALYTICS_REPOSITORIES}>All connected ({source.repositories.length})</option>
            {source.repositories.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          Compare with
          <select
            aria-label="Compare with"
            value={comparisonRepository ?? ""}
            disabled={repository === ALL_ANALYTICS_REPOSITORIES || source.repositories.length < 2}
            onChange={(e) => change("compare", e.target.value || undefined)}
          >
            <option value="">
              {repository === ALL_ANALYTICS_REPOSITORIES ? "Select one repository first" : "No comparison"}
            </option>
            {source.repositories
              .filter((r) => r !== repository)
              .map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>PR author</legend>
          <div className="pa-segment">
            {(["me", "all"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={author === value}
                onClick={() => change("author", value)}
              >
                {value === "me" ? "Me" : "All"}
              </button>
            ))}
          </div>
        </fieldset>
        <PrAnalyticsPeriodPicker
          period={period}
          range={range}
          today={currentDate}
          onPeriod={(value) =>
            setPreferences((p) => ({
              ...p,
              period: value,
              ...(value === "custom"
                ? {
                    customFrom: toLocalDateKey(range.start),
                    customTo: toLocalDateKey(addDays(range.end, -1))
                  }
                : {})
            }))
          }
          onApply={(customFrom, customTo) =>
            setPreferences((p) => ({ ...p, period: "custom", customFrom, customTo }))
          }
        />
        <fieldset>
          <legend>Group by</legend>
          <div className="pa-segment">
            {(["week", "month"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={grouping === value}
                onClick={() => change("grouping", value)}
              >
                {value === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="pa-context">
        <span>
          {rangeLabel} · Local time · {author === "me" ? "PRs authored by you" : "PRs by all authors"}
        </span>
        <span>
          {isDemo
            ? "Preview"
            : source.syncing
              ? "Syncing…"
              : stale
                ? "Cached · refresh recommended"
                : hasData
                  ? "Cached on this device"
                  : "Ready to load"}
        </span>
      </div>
      {source.syncing && (
        <div className="pa-notice" role="status">
          {source.progress
            ? `${source.progress.repository}: ${source.progress.scanned} PRs found · ${source.progress.enriched} processed · ${source.progress.requests} requests`
            : "Connecting to Bitbucket…"}{" "}
          <span>Large histories may need several refreshes.</span>
        </div>
      )}
      {Object.entries(source.errors).map(([name, error]) => (
        <div className="pa-notice pa-warning" role="alert" key={name}>
          <strong>{name === "cache" ? "Local cache" : name}</strong>: {error}
        </div>
      ))}
      {partial && (
        <div className="pa-notice pa-warning">
          Partial coverage. Counts are known minimums; timing samples exclude incomplete histories. Refresh to
          continue.
        </div>
      )}
      {report.missingAuthors && author === "me" && (
        <div className="pa-notice pa-warning">
          Some PR authors have no stable identity and cannot be included in “Me”.
        </div>
      )}
      <details className="pa-coverage">
        <summary>
          {report.coverage.filter((c) => c.complete).length} / {report.coverage.length} repositories loaded
          for this period <ChevronDown size={12} />
        </summary>
        <ul>
          {report.coverage.map((c) => (
            <li key={c.repository}>
              <strong>{c.repository}</strong> —{" "}
              {!c.result
                ? "Not loaded"
                : !c.coversRange
                  ? "Selected period not loaded"
                  : c.complete
                    ? "Loaded"
                    : "Partial"}
              {c.result && (
                <>
                  <span>
                    {" "}
                    · {c.result.pullRequests.length} PRs · synced {dateLabel(c.result.syncedAt)}
                  </span>
                  {c.result.warnings.length > 0 && <p>{c.result.warnings.join(" ")}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
      {comparisonRepository && comparisonReport && (
        <PrAnalyticsComparison
          first={repository}
          second={comparisonRepository}
          left={report}
          right={comparisonReport}
        />
      )}
      {!hasData ? (
        <div className="pa-empty">
          <GitPullRequest size={28} />
          <h2>
            {source.loadingCache ? "Reading your local history…" : "Start with your pull request history"}
          </h2>
          <p>
            {source.repositories.length
              ? "Refresh to load PRs, review events and comments from the selected repositories. Your results stay available offline."
              : "Add repositories in Bitbucket settings to see analytics."}
          </p>
          {source.repositories.length > 0 && (
            <button
              type="button"
              className="pa-button"
              disabled={source.syncing || source.loadingCache}
              onClick={() => void source.refresh(refreshScope)}
            >
              Load analytics
            </button>
          )}
        </div>
      ) : (
        <>
          {comparisonRepository && <p className="pa-ai-basis">Charts and pull request list: {repository}</p>}
          <div className="pa-kpis">
            <button
              type="button"
              onClick={() => {
                setBucketKey(undefined);
                chooseCohort("created");
              }}
            >
              <span>Created</span>
              <strong>{count(report.created)}</strong>
              <small>PRs opened in this period</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setBucketKey(undefined);
                chooseCohort("merged");
              }}
            >
              <span>Merged</span>
              <strong className="pa-green">{count(report.merged)}</strong>
              <small>By dated merge event</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setBucketKey(undefined);
                chooseCohort("merged");
                setChart("merge");
              }}
            >
              <span>Median time to merge</span>
              <strong>{duration(report.merge.median)}</strong>
              <small>
                {report.merge.n} PRs · p75 {duration(report.merge.p75)}
              </small>
            </button>
            <button
              type="button"
              onClick={() => {
                setBucketKey(undefined);
                chooseCohort("comments");
                setChart("comments");
              }}
            >
              <span>Comments</span>
              <strong>{count(report.comments)}</strong>
              <small>Published in this period</small>
            </button>
          </div>
          <PrReviewFlow
            key={analysisKey}
            settings={settings}
            evidence={evidence}
            range={range}
            previousRange={previousRange}
            repository={repository === ALL_ANALYTICS_REPOSITORIES ? "All connected repositories" : repository}
            author={author}
            isDemo={isDemo}
            previousComplete={previousReport.complete}
            syncing={source.syncing}
            onLoadHistory={() =>
              void source.refresh(refreshScope, { start: previousRange.start, end: range.end })
            }
          />
          <div className="pa-charts">
            <section className="pa-throughput" aria-label="PR trends">
              <div className="pa-panel-heading">
                <div>
                  <h2>
                    {chart === "throughput"
                      ? "Throughput"
                      : chart === "comments"
                        ? "Conversation"
                        : "Turnaround"}
                  </h2>
                  <p>{grouping === "week" ? "Weekly" : "Monthly"} · select a period to inspect PRs</p>
                </div>
                <select
                  aria-label="Trend metric"
                  value={chart}
                  onChange={(e) => {
                    setChart(e.target.value as typeof chart);
                    setTooltip(undefined);
                  }}
                >
                  <option value="throughput">Created & merged</option>
                  <option value="comments">Comments</option>
                  <option value="merge">Time to merge</option>
                  <option value="response">First response</option>
                  <option value="review">Review → merge</option>
                </select>
              </div>
              <div className="pa-legend">
                {chart === "throughput" ? (
                  <>
                    <span>
                      <i />
                      Created
                    </span>
                    <span>
                      <i className="pa-merged" />
                      Merged
                    </span>
                  </>
                ) : (
                  <span>
                    {chart === "comments" ? "Comments in period" : "Median elapsed time · calendar hours"}
                  </span>
                )}
                <span>∗ Partial period</span>
              </div>
              <div className="pa-chart-area">
                <div className="pa-chart-scroll" onScroll={() => setTooltip(undefined)}>
                  <div
                    className="pa-bars"
                    style={{
                      gridTemplateColumns: `repeat(${report.buckets.length}, minmax(34px, 1fr))`
                    }}
                  >
                    {report.buckets.map((b) => {
                      const values =
                        chart === "throughput"
                          ? [b.created, b.merged]
                          : chart === "comments"
                            ? [b.comments]
                            : [b[chart].median];
                      const label =
                        chart === "throughput"
                          ? `${b.created} created, ${b.merged} merged`
                          : chart === "comments"
                            ? `${b.comments} comments`
                            : `${duration(b[chart].median)}, ${b[chart].n} PRs`;
                      return (
                        <button
                          className={b.key === bucketKey ? "selected" : ""}
                          key={b.key}
                          type="button"
                          aria-pressed={b.key === bucketKey}
                          aria-label={`${b.label}${b.partial ? ", partial period" : ""}: ${label}${partial ? ", incomplete data" : ""}`}
                          aria-describedby={tooltip?.key === b.key ? tooltipId : undefined}
                          onMouseEnter={(e) => {
                            const area = e.currentTarget.closest(".pa-chart-area")!.getBoundingClientRect();
                            const bar = e.currentTarget.getBoundingClientRect();
                            setTooltip({ key: b.key, x: bar.left + bar.width / 2 - area.left });
                          }}
                          onMouseLeave={() => setTooltip(undefined)}
                          onFocus={(e) => {
                            const area = e.currentTarget.closest(".pa-chart-area")!.getBoundingClientRect();
                            const bar = e.currentTarget.getBoundingClientRect();
                            setTooltip({ key: b.key, x: bar.left + bar.width / 2 - area.left });
                          }}
                          onBlur={() => setTooltip(undefined)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setTooltip(undefined);
                          }}
                          onClick={() => {
                            setBucketKey(b.key === bucketKey ? undefined : b.key);
                            chooseCohort(
                              chart === "comments"
                                ? "comments"
                                : chart === "merge" || chart === "review"
                                  ? "merged"
                                  : "created"
                            );
                          }}
                        >
                          <span className="pa-bar-pair">
                            {values.map((v, i) => (
                              <span
                                key={i}
                                className={`pa-bar${i === 1 || chart !== "throughput" ? " pa-merged" : ""}`}
                                style={{
                                  height:
                                    v === undefined ? 0 : `${Math.max(v > 0 ? 2 : 0, (v / maxBar) * 100)}%`
                                }}
                              />
                            ))}
                            {values.every((v) => v === undefined) && <span className="pa-no-sample">—</span>}
                          </span>
                          <small>
                            {b.label}
                            {b.partial ? "*" : ""}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {hoveredBucket && tooltip && (
                  <div
                    id={tooltipId}
                    role="tooltip"
                    className="pa-chart-tooltip"
                    style={{ left: `clamp(90px, ${tooltip.x}px, calc(100% - 90px))` }}
                  >
                    <strong>
                      {hoveredBucket.label}
                      {hoveredBucket.partial ? " · Partial period" : ""}
                    </strong>
                    {chart === "throughput" ? (
                      <>
                        <span>
                          <span>
                            <i />
                            Created
                          </span>
                          <b>{count(hoveredBucket.created)}</b>
                        </span>
                        <span>
                          <span>
                            <i className="pa-merged" />
                            Merged
                          </span>
                          <b>{count(hoveredBucket.merged)}</b>
                        </span>
                      </>
                    ) : chart === "comments" ? (
                      <span>
                        Comments<b>{count(hoveredBucket.comments)}</b>
                      </span>
                    ) : (
                      <>
                        <span>
                          {chart === "merge"
                            ? "Time to merge"
                            : chart === "response"
                              ? "First response"
                              : "Review → merge"}
                          <b>{duration(hoveredBucket[chart].median)}</b>
                        </span>
                        <small>
                          {hoveredBucket[chart].n} PRs · p75 {duration(hoveredBucket[chart].p75)}
                        </small>
                      </>
                    )}
                    {partial && <small>Incomplete data · counts are minimums</small>}
                  </div>
                )}
              </div>
            </section>
            <section className="pa-timing" aria-label="Review timing">
              <div className="pa-panel-heading">
                <div>
                  <h2>Review timing</h2>
                  <p>Median · elapsed calendar time</p>
                </div>
              </div>
              {(
                [
                  [
                    "First response",
                    report.response,
                    `${report.response.n} / ${report.responseEligible} fully loaded created PRs responded`,
                    "First non-author comment, approval or change request. Created PR cohort; response can arrive after this period."
                  ],
                  [
                    "Review → merge",
                    report.review,
                    `${report.review.n} merged PRs with a response`,
                    "From the first peer response until merge, including waiting and author rework. Not active review effort."
                  ],
                  [
                    "Time to merge",
                    report.merge,
                    `${report.merge.n} merged PRs`,
                    "From PR creation, including draft time, until the dated merge event."
                  ]
                ] as const
              ).map(([label, value, sample, hint]) => (
                <div className="pa-timing-row" key={label} title={hint}>
                  <span>
                    {label}
                    <small>{sample}</small>
                  </span>
                  <strong>
                    {duration(value.median)}
                    <small>p75 {duration(value.p75)}</small>
                  </strong>
                </div>
              ))}
              <p className="pa-timing-note">
                No response is unknown, never zero. Weekends and author rework are included.
              </p>
            </section>
          </div>
          <section className="pa-register" aria-label="Pull requests">
            <div className="pa-panel-heading">
              <div>
                <h2>
                  Pull requests{" "}
                  <span className="pa-badge">
                    {query ? `${rows.length} / ${cohortRows.length}` : rows.length}
                  </span>
                </h2>
                <p>
                  {selectedBucket ? `${selectedBucket.label} · ` : ""}
                  {cohort === "comments"
                    ? "PRs with comments published in the selected period"
                    : `PRs ${cohort} in the selected period`}
                </p>
              </div>
              <div className="pa-table-controls">
                <div className="pa-search">
                  <Search size={13} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search pull requests"
                    placeholder="Search title or #number"
                    value={search}
                    onChange={(e) => searchPrs(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") searchPrs("");
                    }}
                  />
                  {search && (
                    <button type="button" aria-label="Clear PR search" onClick={() => searchPrs("")}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {selectedBucket && (
                  <button
                    type="button"
                    className="pa-button"
                    onClick={() => {
                      setBucketKey(undefined);
                      setPage(0);
                    }}
                  >
                    Clear period <X size={12} />
                  </button>
                )}
                <select
                  aria-label="PR cohort"
                  value={cohort}
                  onChange={(e) => chooseCohort(e.target.value as AnalyticsCohort)}
                >
                  <option value="created">Created</option>
                  <option value="merged">Merged</option>
                  <option value="comments">With comments</option>
                </select>
              </div>
            </div>
            {query && (
              <p className="pa-search-summary" role="status">
                {rows.length} matching {rows.length === 1 ? "PR" : "PRs"} in this table · Charts and totals
                show the full selected scope.
              </p>
            )}
            <div className="pa-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pull request</th>
                    <th>Author</th>
                    <th>Status</th>
                    <th>To merge</th>
                    <th>{cohort === "comments" ? "Comments in period" : "Comments · lifetime"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(activePage * 15, activePage * 15 + 15).map((p) => (
                    <Fragment key={p.key}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="pa-pr-title"
                            aria-expanded={expanded === p.key}
                            onClick={() => setExpanded(expanded === p.key ? undefined : p.key)}
                          >
                            {p.title}
                            <small>
                              {p.repository} · #{p.id}
                            </small>
                          </button>
                        </td>
                        <td>{p.author.displayName || "Unknown"}</td>
                        <td>
                          <span className={`pa-status ${p.state === "MERGED" ? "merged" : ""}`}>
                            {p.draft ? "Draft" : p.state.toLowerCase()}
                          </span>
                        </td>
                        <td>
                          {duration(p.activityComplete ? elapsedHours(p.createdAt, p.mergedAt) : undefined)}
                        </td>
                        <td>
                          {p.commentsComplete
                            ? cohort === "comments"
                              ? p.comments.filter(
                                  (c) =>
                                    +new Date(c.createdAt) >= +tableRange.start &&
                                    +new Date(c.createdAt) < +tableRange.end
                                ).length
                              : p.comments.length
                            : "—"}
                        </td>
                      </tr>
                      {expanded === p.key && (
                        <tr className="pa-detail">
                          <td colSpan={5}>
                            <dl>
                              <div>
                                <dt>Created</dt>
                                <dd>{dateLabel(p.createdAt)}</dd>
                              </div>
                              <div>
                                <dt>First peer response</dt>
                                <dd>
                                  {p.activityComplete && p.commentsComplete
                                    ? dateLabel(p.firstResponseAt)
                                    : "History incomplete"}
                                </dd>
                              </div>
                              <div>
                                <dt>Merged</dt>
                                <dd>{p.activityComplete ? dateLabel(p.mergedAt) : "History incomplete"}</dd>
                              </div>
                            </dl>
                            {!isDemo && (
                              <a href={p.url} target="_blank" rel="noreferrer">
                                Open in Bitbucket <ExternalLink size={12} />
                              </a>
                            )}
                            {isDemo && <span>Sample pull request</span>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="pa-table-empty">No matching pull requests in the loaded history.</p>
              )}
            </div>
            <div className="pa-pagination">
              <span>
                {rows.length
                  ? `${activePage * 15 + 1}–${Math.min(rows.length, (activePage + 1) * 15)} of ${rows.length}`
                  : "0 pull requests"}
              </span>
              <div>
                <button
                  className="pa-button"
                  type="button"
                  disabled={activePage === 0}
                  onClick={() => setPage(activePage - 1)}
                >
                  Previous
                </button>
                <button
                  className="pa-button"
                  type="button"
                  disabled={activePage + 1 >= pageCount}
                  onClick={() => setPage(activePage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
      <details className="pa-method">
        <summary>How these numbers are calculated</summary>
        <p>
          “Me” means PRs authored by your authenticated Bitbucket account. Peer responses and all published
          comments on those PRs are included. All connected means repositories configured in Settings. Medians
          and p75 are calculated from the combined PR samples, never averaged across repositories.
        </p>
        <p>
          Created and merged use their own event dates. Comments include inline threads, resolved discussions
          and replies; deleted and unpublished comments are excluded. A PR created before this period can
          contribute merges or comments inside it. Table comment totals are lifetime totals unless “With
          comments” is selected.
        </p>
        <p>
          Weeks start on Monday in your local timezone. The current period is partial. Times include drafts,
          weekends and rework, and do not measure hours spent reviewing. Missing merge events are excluded (
          {report.missingMerge} in this scope). Bitbucket may not retain deleted comments or withdrawn
          approvals, so first response is the earliest surviving peer event. Bots are included.
        </p>
      </details>
    </section>
  );
}
