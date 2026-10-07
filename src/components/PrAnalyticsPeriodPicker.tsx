import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { AnalyticsPeriod, AnalyticsRange } from "../domain/prAnalytics";
import { analyticsRangeLabel, customAnalyticsRange } from "../domain/prAnalyticsPeriods";
import { addDays, toLocalDateKey } from "../utils/date";

interface Props {
  period: AnalyticsPeriod | "custom";
  range: AnalyticsRange;
  today: Date;
  onPeriod: (period: AnalyticsPeriod | "custom") => void;
  onApply: (from: string, to: string) => void;
}
export function PrAnalyticsPeriodPicker({ period, range, today, onPeriod, onApply }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const [from, setFrom] = useState(toLocalDateKey(range.start));
  const [to, setTo] = useState(toLocalDateKey(addDays(range.end, -1)));
  const validation = customAnalyticsRange(from, to, today);
  useEffect(() => {
    setFrom(toLocalDateKey(range.start));
    setTo(toLocalDateKey(addDays(range.end, -1)));
  }, [+range.start, +range.end]);
  useEffect(() => {
    if (details.current) details.current.open = period === "custom";
  }, [period]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="pa-period-picker">
      <label>
        Period
        <select value={period} onChange={(e) => onPeriod(e.target.value as Props["period"])}>
          <option value="4w">Last 4 weeks</option>
          <option value="12w">Last 12 weeks</option>
          <option value="6m">Last 6 months</option>
          <option value="12m">Last 12 months</option>
          <option value="custom">Custom dates…</option>
        </select>
      </label>
      {period === "custom" && (
        <details
          ref={details}
          className="pa-date-popover"
          onKeyDown={(e) => {
            if (e.key === "Escape" && details.current) {
              details.current.open = false;
              details.current.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            onClick={() => {
              if (!details.current?.open) {
                setFrom(toLocalDateKey(range.start));
                setTo(toLocalDateKey(addDays(range.end, -1)));
              }
            }}
          >
            <CalendarDays size={14} />
            {analyticsRangeLabel(range)}
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!validation.range) return;
              onApply(from, to);
              if (details.current) details.current.open = false;
            }}
          >
            <label>
              From
              <input
                type="date"
                required
                value={from}
                max={toLocalDateKey(today)}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                required
                value={to}
                min={from}
                max={toLocalDateKey(today)}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <p className="pa-date-hint">Both dates included · local time · up to 366 days</p>
            {validation.error && (
              <p className="pa-date-error" role="alert">
                {validation.error}
              </p>
            )}
            <div className="pa-date-actions">
              <button
                className="pa-button"
                type="button"
                onClick={() => {
                  if (details.current) details.current.open = false;
                }}
              >
                Cancel
              </button>
              <button className="pa-button" type="submit" disabled={!validation.range}>
                Apply dates
              </button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
