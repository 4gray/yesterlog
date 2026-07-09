import type { ReactNode } from "react";
import { formatDuration } from "../utils/date";
import { TimeSplit } from "./TimeSplit";

/** Minutes → "1h 50m" / "45m", reusing the app's duration formatter. */
export const formatMinutes = (minutes: number) => formatDuration(minutes / 60);

/**
 * Shared page header for the insight sub-pages (Composition / Focus / Trends):
 * an uppercase eyebrow, a big display figure with a muted unit, a mono caption,
 * and a right-aligned controls slot (the week navigator). When week billable/local
 * hours are supplied it renders the same billable-vs-"to log" split as the Today
 * and Summary headers, directly under the figure row.
 */
export const ReportPageHeader = ({
  eyebrow,
  figure,
  unit,
  accent,
  caption,
  billableHours,
  localHours,
  controls
}: {
  eyebrow: string;
  figure: ReactNode;
  unit?: ReactNode;
  /** Colour token for the figure, e.g. "var(--purple)". Defaults to bright. */
  accent?: string;
  caption?: ReactNode;
  /** Jira-synced (billable) week hours; pair with `localHours` to show the split. */
  billableHours?: number;
  /** Local (notes + recurring) week hours not yet in Jira. */
  localHours?: number;
  controls?: ReactNode;
}) => {
  const hasSplit = billableHours !== undefined && billableHours + (localHours ?? 0) > 0.01;
  return (
    <div className={`reports-header report-page-header${hasSplit ? " has-split" : ""}`}>
      <div className="report-head-lead">
        <div className="eyebrow">{eyebrow}</div>
        <div className="report-figure-row">
          <div className="big-figure" style={accent ? { color: accent } : undefined}>
            {figure}
            {unit ? <span className="unit"> {unit}</span> : null}
          </div>
          {caption ? <span className="report-caption">{caption}</span> : null}
        </div>
        {hasSplit && (
          <TimeSplit billableHours={billableHours} localHours={localHours ?? 0} size="lg" className="reports-split" />
        )}
      </div>
      {controls ? <div className="reports-actions">{controls}</div> : null}
    </div>
  );
};

/** A raised card panel used across the insight pages. */
export const ReportPanel = ({
  title,
  aux,
  legend,
  className,
  children
}: {
  title?: string;
  aux?: ReactNode;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`report-panel${className ? ` ${className}` : ""}`}>
    {title || aux || legend ? (
      <div className="report-panel-head">
        {title ? <span className="report-panel-title">{title}</span> : null}
        {legend ? <div className="report-legend">{legend}</div> : aux ? <span className="report-panel-aux">{aux}</span> : null}
      </div>
    ) : null}
    {children}
  </div>
);

/** A tinted insight callout: square icon chip + one sentence. */
export const ReportInsight = ({
  accent,
  icon,
  children
}: {
  /** Accent colour token driving border, tint and chip. */
  accent: string;
  icon: ReactNode;
  children: ReactNode;
}) => (
  <div
    className="report-insight"
    style={{
      borderColor: `color-mix(in srgb, ${accent} 28%, var(--border))`,
      background: `color-mix(in srgb, ${accent} 6%, var(--bg-raised))`
    }}
  >
    <div className="report-insight-chip" style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}>
      {icon}
    </div>
    <div className="report-insight-text">{children}</div>
  </div>
);

/** A small square-swatch legend entry. */
export const LegendChip = ({
  color,
  outline,
  hatched,
  children
}: {
  color?: string;
  outline?: boolean;
  hatched?: boolean;
  children: ReactNode;
}) => (
  <span className="report-legend-item">
    <span
      className={`report-legend-swatch${outline ? " is-outline" : ""}${hatched ? " is-hatched" : ""}`}
      style={color ? { background: color } : undefined}
    />
    {children}
  </span>
);

/** Shared empty state for a page/panel that has no data for the range yet. */
export const ReportEmpty = ({ children }: { children: ReactNode }) => (
  <div className="report-empty">{children}</div>
);
