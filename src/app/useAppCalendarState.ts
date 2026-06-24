import { useState } from "react";
import type { WeekOverride } from "../../shared/types";
import type { DemoScenario } from "../demo/fixtures";
import { getMonthAnchor } from "../domain/month";
import { getWeekBounds } from "../domain/week";
import { toLocalDateKey } from "../utils/date";

interface UseAppCalendarStateOptions {
  currentDate: Date;
  demoScenario?: Pick<DemoScenario, "weekStart" | "weekOverride">;
}

const buildDefaultWeekOverride = (weekStart: Date): WeekOverride => ({
  weekKey: toLocalDateKey(weekStart),
  skippedDates: []
});

export const useAppCalendarState = ({ currentDate, demoScenario }: UseAppCalendarStateOptions) => {
  const [weekStart, setWeekStart] = useState(() => demoScenario?.weekStart ?? getWeekBounds(currentDate).weekStart);
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthAnchor(currentDate));
  const [weekOverride, setWeekOverride] = useState<WeekOverride>(() => ({
    ...(demoScenario?.weekOverride ?? buildDefaultWeekOverride(getWeekBounds(currentDate).weekStart))
  }));

  return {
    weekStart,
    setWeekStart,
    monthAnchor,
    setMonthAnchor,
    weekOverride,
    setWeekOverride
  };
};
