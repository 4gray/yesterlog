import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { WeekState } from "../../shared/types";
import { weekBillableSplit } from "../domain/activity";
import { buildReportsHistory, MIN_TREND_WEEKS, type TrendPoint } from "../domain/reportsTrend";
import { buildTrends, type TrendKpi, type TrendsComparison } from "../domain/reportsInsights";
import { formatDuration, formatHours } from "../utils/date";
import { LegendChip, ReportEmpty, ReportPageHeader, ReportPanel } from "./reportsShared";
import { WeekNavigator } from "./WeekNavigator";

interface ReportsTrendsProps {
  weekState: WeekState;
  weekStates?: WeekState[];
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

type TrendKpiView = TrendKpi & { figure: string };

const TrendDelta = ({ kpi, caption }: { kpi: TrendKpiView; caption: string }) => (
  <>
    <div className="trend-kpi-value">
      <span className="trend-kpi-figure">{kpi.figure}</span>
      {kpi.deltaLabel ? (
        <span className={`trend-kpi-delta is-${kpi.deltaTone}`}>
          {kpi.deltaUp ? "▲" : "▼"} {kpi.deltaLabel}
        </span>
      ) : null}
    </div>
    <div className="kpi-note">{kpi.previousLabel ? `${caption} ${kpi.previousLabel}` : "no baseline yet"}</div>
  </>
);

/** Reused 12-week tracked-vs-target line, for the longer view below the fold. */
const TrendChart = ({ points }: { points: TrendPoint[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);

  const geo = useMemo(() => {
    const vbW = 720;
    const vbH = 240;
    const padX = 14;
    const padT = 26;
    const padB = 28;
    const maxY = Math.max(1, ...points.map((point) => Math.max(point.trackedHours, point.targetHours))) * 1.12;
    const stepX = points.length > 1 ? (vbW - padX * 2) / (points.length - 1) : 0;
    const x = (index: number) => padX + index * stepX;
    const y = (value: number) => padT + (vbH - padT - padB) * (1 - value / maxY);
    return {
      vbW,
      vbH,
      stepX,
      trackedLine: points.map((point, index) => `${x(index).toFixed(1)},${y(point.trackedHours).toFixed(1)}`).join(" "),
      targetLine: points.map((point, index) => `${x(index).toFixed(1)},${y(point.targetHours).toFixed(1)}`).join(" "),
      dots: points.map((point, index) => ({ ...point, cx: x(index), cy: y(point.trackedHours) }))
    };
  }, [points]);

  const moveTo = (index: number, event: ReactMouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, index });
  };
  const clear = () => setHover(null);
  const active = hover ? geo.dots[hover.index] : undefined;

  return (
    <div className="trend-chart" ref={containerRef}>
      <svg className="trend-svg" viewBox={`0 0 ${geo.vbW} ${geo.vbH}`} role="img" aria-label="Tracked hours per week against target">
        <polyline className="trend-target" points={geo.targetLine} />
        <polyline className="trend-line" points={geo.trackedLine} />
        {active ? <line className="trend-guide" x1={active.cx} y1={0} x2={active.cx} y2={geo.vbH} /> : null}
        {geo.dots.map((dot, index) => (
          <circle
            key={dot.weekKey}
            className={`trend-dot ${dot.onTarget ? "is-on" : "is-under"} ${dot.isCurrent ? "is-current" : ""} ${hover?.index === index ? "is-hover" : ""}`}
            cx={dot.cx}
            cy={dot.cy}
            r={hover?.index === index ? 9 : dot.isCurrent ? 8 : 6}
          />
        ))}
        {geo.dots.map((dot, index) => (
          <rect
            key={`hit-${dot.weekKey}`}
            className="trend-hit"
            x={dot.cx - (geo.stepX || geo.vbW) / 2}
            y={0}
            width={geo.stepX || geo.vbW}
            height={geo.vbH}
            onMouseEnter={(event) => moveTo(index, event)}
            onMouseMove={(event) => moveTo(index, event)}
            onMouseLeave={clear}
          />
        ))}
      </svg>
      {hover && active ? (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tip-title">{active.label}</div>
          <div className="chart-tip-row">
            <span className="tip-swatch is-tracked" />
            <span className="tip-label">Tracked</span>
            <b>{formatHours(active.trackedHours)}</b>
          </div>
          <div className="chart-tip-row">
            <span className="tip-swatch is-target" />
            <span className="tip-label">Target</span>
            <b>{formatHours(active.targetHours)}</b>
          </div>
        </div>
      ) : null}
      <div className="trend-axis">
        {points.map((point, index) => (
          <span key={point.weekKey} className={`${point.isCurrent ? "is-current" : ""} ${hover?.index === index ? "is-hover" : ""}`}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export const ReportsTrends = ({
  weekState,
  weekStates,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: ReportsTrendsProps) => {
  const [comparison, setComparison] = useState<TrendsComparison>("last");

  const report = useMemo(
    () => (weekStates && weekStates.length > 0 ? buildTrends(weekStates, weekState.weekKey, comparison) : undefined),
    [weekStates, weekState.weekKey, comparison]
  );
  const history = useMemo(
    () => (weekStates && weekStates.length > 0 ? buildReportsHistory(weekStates, weekState.weekKey) : undefined),
    [weekStates, weekState.weekKey]
  );

  const navigator = (
    <WeekNavigator onPreviousWeek={onPreviousWeek} onCurrentWeek={onCurrentWeek} onNextWeek={onNextWeek} />
  );
  const toggle = (
    <div className="report-segmented" role="tablist" aria-label="Comparison window">
      <button
        type="button"
        role="tab"
        aria-selected={comparison === "last"}
        className={comparison === "last" ? "is-active" : ""}
        onClick={() => setComparison("last")}
      >
        VS LAST WEEK
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={comparison === "4week"}
        className={comparison === "4week" ? "is-active" : ""}
        onClick={() => setComparison("4week")}
      >
        4-WEEK
      </button>
    </div>
  );

  // A flat week is "0%", never a signed "−0%".
  const headlineFigure = !report?.hasComparison
    ? "—"
    : report.headlinePct === 0
      ? "0"
      : `${report.totalLogged.deltaUp ? "+" : "−"}${report.headlinePct}`;
  const split = weekBillableSplit(weekState);
  const header = (
    <ReportPageHeader
      eyebrow="REPORTS — TRENDS"
      figure={headlineFigure}
      unit={report?.hasComparison ? (comparison === "4week" ? "% vs avg" : "% vs last") : undefined}
      caption={report?.comparisonLabel ?? "building baseline"}
      billableHours={split.billableHours}
      localHours={split.localHours}
      controls={
        <>
          {toggle}
          {navigator}
        </>
      }
    />
  );

  if (!report) {
    return (
      <>
        {header}
        <div className="report-body">
          <ReportEmpty>Trends compare weeks against each other — they appear once more weeks have data.</ReportEmpty>
        </div>
      </>
    );
  }

  const kpis: Array<{ label: string; kpi: TrendKpiView; valueClass?: string }> = [
    {
      label: "TOTAL LOGGED",
      kpi: { ...report.totalLogged, figure: formatDuration(report.totalLoggedHours) }
    },
    {
      label: "INVISIBLE WORK",
      kpi: { ...report.invisible, figure: `${report.invisiblePct}%` },
      valueClass: "is-purple"
    },
    {
      label: "LONGEST FOCUS",
      kpi: { ...report.longestFocus, figure: formatDuration(report.longestFocusMinutes / 60) }
    }
  ];

  const overlayMax = Math.max(1, ...report.days.map((day) => Math.max(day.thisHours, day.lastHours)));

  return (
    <>
      {header}

      <div className="kpi-row trend-kpi-row">
        {kpis.map(({ label, kpi, valueClass }) => (
          <div className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className={`trend-kpi ${valueClass ?? ""}`}>
              <TrendDelta kpi={kpi} caption={report.previousCaption} />
            </div>
          </div>
        ))}
      </div>

      <div className="report-body">
        <div className="report-columns">
          <ReportPanel
            className="is-wide"
            title="HOURS PER DAY"
            legend={
              <>
                <LegendChip color="var(--blue)">this week</LegendChip>
                <LegendChip outline>last week</LegendChip>
              </>
            }
          >
            <div className="overlay-chart">
              {report.days.map((day) => (
                <div className="overlay-col" key={day.label}>
                  <div className="overlay-bars">
                    <span className="overlay-bar is-last" style={{ height: `${(day.lastHours / overlayMax) * 100}%` }} />
                    <span className="overlay-bar is-this" style={{ height: `${(day.thisHours / overlayMax) * 100}%` }} />
                  </div>
                  <span className={`overlay-day${day.isToday ? " is-today" : ""}`}>{day.label}</span>
                </div>
              ))}
            </div>
          </ReportPanel>

          <ReportPanel title="4-WEEK TREND">
            <div className="spark-list">
              {report.sparklines.map((metric) => (
                <div className="spark-metric" key={metric.key}>
                  <div className="spark-head">
                    <span className="spark-label">{metric.label}</span>
                    <span className="spark-value" style={{ color: metric.color }}>
                      {metric.unit === "percent" ? `${Math.round(metric.latestValue)}%` : formatDuration(metric.latestValue)}
                    </span>
                  </div>
                  <div className="spark-bars">
                    {metric.bars.map((value, index) => {
                      const isLatest = index === metric.bars.length - 1;
                      return (
                        <span
                          key={index}
                          className={`spark-bar${isLatest ? " is-latest" : ""}`}
                          style={{ height: `${Math.max(value * 100, 4)}%`, background: isLatest ? metric.color : undefined }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="comp-footnote is-plain spark-foot">
              {report.reviewHoursThisWeek > 0
                ? `Meetings & review this week: ${formatDuration(report.reviewHoursThisWeek)}.`
                : "Meetings & review were quiet this week."}
            </div>
          </ReportPanel>
        </div>

        {history && history.hasBaseline ? (
          <ReportPanel title="WEEK OVER WEEK" aux={`${history.trend.length} WEEKS · TRACKED VS TARGET`}>
            <TrendChart points={history.trend} />
          </ReportPanel>
        ) : history ? (
          <ReportEmpty>
            Building baseline — {history.populatedWeeks} of {MIN_TREND_WEEKS} weeks tracked. The longer week-over-week
            view appears once more weeks have data.
          </ReportEmpty>
        ) : null}
      </div>
    </>
  );
};
