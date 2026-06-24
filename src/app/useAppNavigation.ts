import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { JiraTicket } from "../../shared/types";
import type { AppView } from "../components/Sidebar";
import { getMonthAnchor } from "../domain/month";
import { getWeekBounds } from "../domain/week";
import { addDays } from "../utils/date";

interface UseAppNavigationOptions {
  currentDate: Date;
  isBitbucketReady: boolean;
  view: AppView;
  setView: Dispatch<SetStateAction<AppView>>;
  setWeekStart: Dispatch<SetStateAction<Date>>;
  setMonthAnchor: Dispatch<SetStateAction<Date>>;
  setSelectedTicket: Dispatch<SetStateAction<JiraTicket | undefined>>;
}

export const useAppNavigation = ({
  currentDate,
  isBitbucketReady,
  view,
  setView,
  setWeekStart,
  setMonthAnchor,
  setSelectedTicket
}: UseAppNavigationOptions) => {
  useEffect(() => {
    if (view === "review" && !isBitbucketReady) {
      setView("week");
    }
  }, [isBitbucketReady, setView, view]);

  const goToWeek = useCallback(
    (date: Date) => {
      setWeekStart(getWeekBounds(date).weekStart);
    },
    [setWeekStart]
  );

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((current) => addDays(current, -7));
  }, [setWeekStart]);

  const goToCurrentWeek = useCallback(() => {
    goToWeek(currentDate);
  }, [currentDate, goToWeek]);

  const goToNextWeek = useCallback(() => {
    setWeekStart((current) => addDays(current, 7));
  }, [setWeekStart]);

  const goToPreviousMonth = useCallback(() => {
    setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }, [setMonthAnchor]);

  const goToNextMonth = useCallback(() => {
    setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }, [setMonthAnchor]);

  const goToCurrentMonth = useCallback(() => {
    setMonthAnchor(getMonthAnchor(currentDate));
  }, [currentDate, setMonthAnchor]);

  const openWeekFromMonth = useCallback(
    (date: Date) => {
      goToWeek(date);
      setView("week");
    },
    [goToWeek, setView]
  );

  const handleViewChange = useCallback(
    (nextView: AppView) => {
      if (nextView === "today" || nextView === "tickets") {
        goToCurrentWeek();
      }
      if (nextView === "month") {
        setMonthAnchor(getMonthAnchor(currentDate));
      }
      setView(nextView);
    },
    [currentDate, goToCurrentWeek, setMonthAnchor, setView]
  );

  const handleLogTicket = useCallback(
    (ticket: JiraTicket) => {
      setSelectedTicket(ticket);
      setView("today");
    },
    [setSelectedTicket, setView]
  );

  return {
    goToWeek,
    goToPreviousWeek,
    goToCurrentWeek,
    goToNextWeek,
    goToPreviousMonth,
    goToCurrentMonth,
    goToNextMonth,
    openWeekFromMonth,
    handleViewChange,
    handleLogTicket
  };
};
