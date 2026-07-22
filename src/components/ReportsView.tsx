import type { WeekState } from "../../shared/types";
import type { ReportTab } from "./Sidebar";
import { ReportsComposition } from "./ReportsComposition";
import { ReportsFocus } from "./ReportsFocus";
import { ReportsSummary } from "./ReportsSummary";
import { ReportsTrends } from "./ReportsTrends";

interface ReportsViewProps {
  reportTab: ReportTab;
  weekState: WeekState;
  /** Trailing window of weeks (ascending, ending at weekState) for insights. */
  weekStates?: WeekState[];
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onOpenRecap?: () => void;
}

/**
 * Reports is a parent section: Summary is the landing page, and Composition /
 * Focus / Trends are insight sub-pages selected from the sidebar sub-nav. Every
 * page shares the same scroll container so switching tabs keeps the layout.
 */
export const ReportsView = ({
  reportTab,
  weekState,
  weekStates,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onOpenRecap = () => undefined
}: ReportsViewProps) => {
  const nav = { onPreviousWeek, onCurrentWeek, onNextWeek };

  return (
    <div className="view view-scroll">
      {reportTab === "composition" ? (
        <ReportsComposition weekState={weekState} onOpenRecap={onOpenRecap} {...nav} />
      ) : reportTab === "focus" ? (
        <ReportsFocus weekState={weekState} weekStates={weekStates} {...nav} />
      ) : reportTab === "trends" ? (
        <ReportsTrends weekState={weekState} weekStates={weekStates} {...nav} />
      ) : (
        <ReportsSummary weekState={weekState} weekStates={weekStates} onOpenRecap={onOpenRecap} {...nav} />
      )}
    </div>
  );
};
