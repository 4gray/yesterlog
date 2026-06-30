import type { ComponentProps } from "react";
import { ReportsView } from "../components/ReportsView";

type ReportsViewProps = ComponentProps<typeof ReportsView>;

export interface AppReportsRouteProps {
  weekState: ReportsViewProps["weekState"];
  weekStates?: ReportsViewProps["weekStates"];
  goToPreviousWeek: ReportsViewProps["onPreviousWeek"];
  goToCurrentWeek: ReportsViewProps["onCurrentWeek"];
  goToNextWeek: ReportsViewProps["onNextWeek"];
}

export const AppReportsRoute = ({
  weekState,
  weekStates,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek
}: AppReportsRouteProps) => (
  <ReportsView
    weekState={weekState}
    weekStates={weekStates}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
  />
);
