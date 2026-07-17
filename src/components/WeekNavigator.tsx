import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekNavigatorProps {
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  className?: string;
  /**
   * Strip variant: shows the visible range (never "THIS WEEK") between the
   * arrows and moves the jump-to-today affordance into its own button.
   */
  rangeLabel?: string;
  /** Strip variant only: render TODAY, i.e. the visible week is not the current one. */
  showToday?: boolean;
}

export const WeekNavigator = ({
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  className,
  rangeLabel,
  showToday = false
}: WeekNavigatorProps) => {
  const isStrip = rangeLabel !== undefined;

  return (
    <div
      className={`week-nav${isStrip ? " is-strip" : ""}${className ? ` ${className}` : ""}`}
      aria-label="Week navigation"
    >
      <button type="button" className="week-nav-arrow" onClick={onPreviousWeek} aria-label="Previous week">
        {isStrip ? <ChevronLeft size={13} strokeWidth={2} /> : "‹"}
      </button>

      {isStrip ? (
        <span className="week-nav-range">{rangeLabel}</span>
      ) : (
        <button type="button" className="pill" onClick={onCurrentWeek}>
          THIS WEEK
        </button>
      )}

      <button type="button" className="week-nav-arrow" onClick={onNextWeek} aria-label="Next week">
        {isStrip ? <ChevronRight size={13} strokeWidth={2} /> : "›"}
      </button>

      {isStrip && showToday && (
        <button type="button" className="week-nav-today" onClick={onCurrentWeek}>
          TODAY
        </button>
      )}
    </div>
  );
};
