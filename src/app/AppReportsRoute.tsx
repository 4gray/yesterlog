import type { ComponentProps } from "react";
import { ReportsView } from "../components/ReportsView";

type ReportsViewProps = ComponentProps<typeof ReportsView>;

export interface AppReportsRouteProps {
  weekState: ReportsViewProps["weekState"];
  goToPreviousWeek: ReportsViewProps["onPreviousWeek"];
  goToCurrentWeek: ReportsViewProps["onCurrentWeek"];
  goToNextWeek: ReportsViewProps["onNextWeek"];
}

export const AppReportsRoute = ({
  weekState,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek
}: AppReportsRouteProps) => (
  <ReportsView
    weekState={weekState}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
  />
);
