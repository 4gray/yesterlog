import type { ComponentProps } from "react";
import { ReportsView } from "../components/ReportsView";

type ReportsViewProps = ComponentProps<typeof ReportsView>;

export interface AppReportsRouteProps {
  reportTab: ReportsViewProps["reportTab"];
  weekState: ReportsViewProps["weekState"];
  weekStates?: ReportsViewProps["weekStates"];
  reviewResult?: ReportsViewProps["reviewResult"];
  isBitbucketReady: ReportsViewProps["isBitbucketReady"];
  issueUrlsByKey: ReportsViewProps["issueUrlsByKey"];
  issueTypesByKey: ReportsViewProps["issueTypesByKey"];
  onReportTabChange: ReportsViewProps["onReportTabChange"];
  goToPreviousWeek: ReportsViewProps["onPreviousWeek"];
  goToCurrentWeek: ReportsViewProps["onCurrentWeek"];
  goToNextWeek: ReportsViewProps["onNextWeek"];
  onOpenRecap?: ReportsViewProps["onOpenRecap"];
}

export const AppReportsRoute = ({
  reportTab,
  weekState,
  weekStates,
  reviewResult,
  isBitbucketReady,
  issueUrlsByKey,
  issueTypesByKey,
  onReportTabChange,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek,
  onOpenRecap
}: AppReportsRouteProps) => (
  <ReportsView
    reportTab={reportTab}
    weekState={weekState}
    weekStates={weekStates}
    reviewResult={reviewResult}
    isBitbucketReady={isBitbucketReady}
    issueUrlsByKey={issueUrlsByKey}
    issueTypesByKey={issueTypesByKey}
    onReportTabChange={onReportTabChange}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
    onOpenRecap={onOpenRecap}
  />
);
