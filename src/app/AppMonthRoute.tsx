import type { ComponentProps } from "react";
import { LoadingView } from "../components/LoadingView";
import { MonthView } from "../components/MonthView";

type MonthViewProps = ComponentProps<typeof MonthView>;

export interface AppMonthRouteProps {
  monthState: MonthViewProps["monthState"] | undefined;
  openWeekFromMonth: MonthViewProps["onSelectWeek"];
  goToPreviousMonth: MonthViewProps["onPreviousMonth"];
  goToCurrentMonth: MonthViewProps["onCurrentMonth"];
  goToNextMonth: MonthViewProps["onNextMonth"];
}

export const AppMonthRoute = ({
  monthState,
  openWeekFromMonth,
  goToPreviousMonth,
  goToCurrentMonth,
  goToNextMonth
}: AppMonthRouteProps) => {
  if (!monthState) {
    return <LoadingView />;
  }

  return (
    <MonthView
      monthState={monthState}
      onSelectWeek={openWeekFromMonth}
      onPreviousMonth={goToPreviousMonth}
      onCurrentMonth={goToCurrentMonth}
      onNextMonth={goToNextMonth}
    />
  );
};
