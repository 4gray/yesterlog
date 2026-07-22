import type { ComponentProps } from "react";
import { ReportsView } from "../components/ReportsView";

type ReportsViewProps = ComponentProps<typeof ReportsView>;

export interface AppReportsRouteProps {
  reportTab: ReportsViewProps["reportTab"];
  weekState: ReportsViewProps["weekState"];
  weekStates?: ReportsViewProps["weekStates"];
  goToPreviousWeek: ReportsViewProps["onPreviousWeek"];
  goToCurrentWeek: ReportsViewProps["onCurrentWeek"];
  goToNextWeek: ReportsViewProps["onNextWeek"];
  onOpenRecap?: ReportsViewProps["onOpenRecap"];
}

export const AppReportsRoute = ({
  reportTab,
  weekState,
  weekStates,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek,
  onOpenRecap
}: AppReportsRouteProps) => (
  <ReportsView
    reportTab={reportTab}
    weekState={weekState}
    weekStates={weekStates}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
    onOpenRecap={onOpenRecap}
  />
);
