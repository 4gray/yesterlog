import type {
  BitbucketReviewSyncResult,
  JiraIssueTypeInfo,
  WeekState
} from "../../shared/types";
import { REPORT_TABS, type ReportTab } from "./Sidebar";
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
 * Focus / Trends are insight sub-pages selected from the in-view tab strip.
 * Every page shares the same scroll container so switching tabs keeps the layout.
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
      <div className="report-tabs" role="tablist" aria-label="Reports pages">
        {REPORT_TABS.filter((tab) => tab.id !== "reviews" || isBitbucketReady).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={reportTab === tab.id}
            className={`report-tab${reportTab === tab.id ? " active" : ""}`}
            onClick={() => onReportTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
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
