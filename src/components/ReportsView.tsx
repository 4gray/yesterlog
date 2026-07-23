import type {
  BitbucketReviewSyncResult,
  JiraIssueTypeInfo,
  WeekState
} from "../../shared/types";
import type { ReportTab } from "./Sidebar";
import { ReportsComposition } from "./ReportsComposition";
import { ReportsFocus } from "./ReportsFocus";
import { ReportsReviews } from "./ReportsReviews";
import { ReportsSummary } from "./ReportsSummary";
import { ReportsTrends } from "./ReportsTrends";

interface ReportsViewProps {
  reportTab: ReportTab;
  weekState: WeekState;
  /** Trailing window of weeks (ascending, ending at weekState) for insights. */
  weekStates?: WeekState[];
  reviewResult?: BitbucketReviewSyncResult;
  isBitbucketReady?: boolean;
  issueUrlsByKey?: Record<string, string>;
  issueTypesByKey?: Record<string, JiraIssueTypeInfo>;
  onReportTabChange?: (tab: ReportTab) => void;
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
  reviewResult,
  isBitbucketReady = false,
  issueUrlsByKey = {},
  issueTypesByKey = {},
  onReportTabChange = () => undefined,
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
      ) : reportTab === "reviews" && isBitbucketReady ? (
        <ReportsReviews
          weekState={weekState}
          result={reviewResult}
          issueUrlsByKey={issueUrlsByKey}
          issueTypesByKey={issueTypesByKey}
          {...nav}
        />
      ) : (
        <ReportsSummary
          weekState={weekState}
          weekStates={weekStates}
          reviewResult={reviewResult}
          showReviewAnalytics={isBitbucketReady}
          onOpenReviewReport={() => onReportTabChange("reviews")}
          onOpenRecap={onOpenRecap}
          {...nav}
        />
      )}
    </div>
  );
};
