import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { JiraWorklog, PersonalNote, WeekState } from "../../shared/types";
import type { AddTimePrefill } from "../components/AddTimeModal";
import { getWeekBounds } from "../domain/week";
import {
  canOpenTrackingShortcut,
  createTrackingShortcutDate,
  selectAddTimeDate
} from "./addTimeModalState";

interface UseAddTimeModalActionsOptions {
  currentDate: Date;
  weekState: Pick<WeekState, "activeWorkingDates" | "days">;
  isConfigured: boolean;
  welcomeConnected: boolean;
  isBooting: boolean;
  addModalDate?: Date;
  editingWorklog?: JiraWorklog;
  editingPersonalNote?: PersonalNote;
  setWeekStart: Dispatch<SetStateAction<Date>>;
  setAddModalDate: Dispatch<SetStateAction<Date | undefined>>;
  setAddTimePrefill: Dispatch<SetStateAction<AddTimePrefill | undefined>>;
  setEditingWorklog: Dispatch<SetStateAction<JiraWorklog | undefined>>;
  setEditingPersonalNote: Dispatch<SetStateAction<PersonalNote | undefined>>;
  setLogError: Dispatch<SetStateAction<string | undefined>>;
}

export const useAddTimeModalActions = ({
  currentDate,
  weekState,
  isConfigured,
  welcomeConnected,
  isBooting,
  addModalDate,
  editingWorklog,
  editingPersonalNote,
  setWeekStart,
  setAddModalDate,
  setAddTimePrefill,
  setEditingWorklog,
  setEditingPersonalNote,
  setLogError
}: UseAddTimeModalActionsOptions) => {
  const openAddTime = useCallback(
    (date?: Date, prefill?: AddTimePrefill) => {
      setEditingWorklog(undefined);
      setEditingPersonalNote(undefined);
      setLogError(undefined);
      setAddTimePrefill(prefill ?? { retrospective: true });
      setAddModalDate(selectAddTimeDate({ currentDate, requestedDate: date, weekState }));
    },
    [currentDate, setAddModalDate, setAddTimePrefill, setEditingPersonalNote, setEditingWorklog, setLogError, weekState]
  );

  const openTrackingShortcut = useCallback(() => {
    if (
      !canOpenTrackingShortcut({
        isConfigured,
        welcomeConnected,
        isBooting,
        hasAddModal: Boolean(addModalDate),
        hasEditingWorklog: Boolean(editingWorklog),
        hasEditingPersonalNote: Boolean(editingPersonalNote)
      })
    ) {
      return;
    }

    setWeekStart(getWeekBounds(currentDate).weekStart);
    setEditingWorklog(undefined);
    setEditingPersonalNote(undefined);
    setLogError(undefined);
    setAddTimePrefill({ retrospective: true });
    setAddModalDate(createTrackingShortcutDate(currentDate));
  }, [
    addModalDate,
    currentDate,
    editingPersonalNote,
    editingWorklog,
    isBooting,
    isConfigured,
    setAddModalDate,
    setAddTimePrefill,
    setEditingPersonalNote,
    setEditingWorklog,
    setLogError,
    setWeekStart,
    welcomeConnected
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      openTrackingShortcut();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openTrackingShortcut]);

  const openEditWorklog = useCallback(
    (worklog: JiraWorklog) => {
      setAddModalDate(undefined);
      setAddTimePrefill(undefined);
      setLogError(undefined);
      setEditingPersonalNote(undefined);
      setEditingWorklog(worklog);
    },
    [setAddModalDate, setAddTimePrefill, setEditingPersonalNote, setEditingWorklog, setLogError]
  );

  const openEditPersonalNote = useCallback(
    (note: PersonalNote) => {
      setAddModalDate(undefined);
      setAddTimePrefill(undefined);
      setLogError(undefined);
      setEditingWorklog(undefined);
      setEditingPersonalNote(note);
    },
    [setAddModalDate, setAddTimePrefill, setEditingPersonalNote, setEditingWorklog, setLogError]
  );

  const closeAddTime = useCallback(() => {
    setAddModalDate(undefined);
    setAddTimePrefill(undefined);
  }, [setAddModalDate, setAddTimePrefill]);

  const closeEditingWorklog = useCallback(() => {
    setEditingWorklog(undefined);
  }, [setEditingWorklog]);

  const closeEditingPersonalNote = useCallback(() => {
    setEditingPersonalNote(undefined);
  }, [setEditingPersonalNote]);

  return {
    openAddTime,
    openTrackingShortcut,
    openEditWorklog,
    openEditPersonalNote,
    closeAddTime,
    closeEditingWorklog,
    closeEditingPersonalNote
  };
};
