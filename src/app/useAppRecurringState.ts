import { useState } from "react";
import type { RecurringEvent, RecurringOccurrence } from "../../shared/types";
import { buildDefaultRecurringEvents } from "../domain/recurring";

interface UseAppRecurringStateOptions {
  isDemo: boolean;
}

export const useAppRecurringState = ({ isDemo }: UseAppRecurringStateOptions) => {
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>(() =>
    isDemo ? buildDefaultRecurringEvents() : []
  );
  const [recurringOccurrences, setRecurringOccurrences] = useState<RecurringOccurrence[]>([]);

  return {
    recurringEvents,
    setRecurringEvents,
    recurringOccurrences,
    setRecurringOccurrences
  };
};
