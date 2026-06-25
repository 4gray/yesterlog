import type { ComponentProps } from "react";
import { ReviewView } from "../components/ReviewView";

type ReviewViewProps = ComponentProps<typeof ReviewView>;

export interface AppReviewRouteProps {
  weekKey: ReviewViewProps["weekKey"];
  weekStartISO: ReviewViewProps["weekStartISO"];
  settings: ReviewViewProps["settings"];
  visibleBitbucketReviewResult: ReviewViewProps["result"];
  issueUrlsByKey: ReviewViewProps["issueUrlsByKey"];
  issueTypesByKey: ReviewViewProps["issueTypesByKey"];
  isBitbucketReady: ReviewViewProps["isConfigured"];
  isSyncingReviews: ReviewViewProps["isSyncing"];
  isLoggingReview: ReviewViewProps["isLogging"];
  reviewTargetMode: ReviewViewProps["targetMode"];
  setReviewTargetMode: ReviewViewProps["onTargetModeChange"];
  handleReviewSync: ReviewViewProps["onSync"];
  handleLogReviewSessions: ReviewViewProps["onLogSessions"];
  goToPreviousWeek: ReviewViewProps["onPreviousWeek"];
  goToCurrentWeek: ReviewViewProps["onCurrentWeek"];
  goToNextWeek: ReviewViewProps["onNextWeek"];
}

export const AppReviewRoute = ({
  weekKey,
  weekStartISO,
  settings,
  visibleBitbucketReviewResult,
  issueUrlsByKey,
  issueTypesByKey,
  isBitbucketReady,
  isSyncingReviews,
  isLoggingReview,
  reviewTargetMode,
  setReviewTargetMode,
  handleReviewSync,
  handleLogReviewSessions,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek
}: AppReviewRouteProps) => (
  <ReviewView
    weekKey={weekKey}
    weekStartISO={weekStartISO}
    settings={settings}
    result={visibleBitbucketReviewResult}
    issueUrlsByKey={issueUrlsByKey}
    issueTypesByKey={issueTypesByKey}
    isConfigured={isBitbucketReady}
    isSyncing={isSyncingReviews}
    isLogging={isLoggingReview}
    targetMode={reviewTargetMode}
    onTargetModeChange={setReviewTargetMode}
    onSync={handleReviewSync}
    onLogSessions={handleLogReviewSessions}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
  />
);
