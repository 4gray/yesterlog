interface MonthNavigatorProps {
  label: string;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
}

export const MonthNavigator = ({
  label,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth
}: MonthNavigatorProps) => (
  <div className="week-nav" aria-label="Month navigation">
    <button type="button" className="week-nav-arrow" onClick={onPreviousMonth} aria-label="Previous month">
      ‹
    </button>
    <button type="button" className="pill" onClick={onCurrentMonth} title="Jump to the current month">
      {label}
    </button>
    <button type="button" className="week-nav-arrow" onClick={onNextMonth} aria-label="Next month">
      ›
    </button>
  </div>
);
