import { useState } from "react";
import type { JiraWorklog } from "../../shared/types";
import type { AddTimePrefill } from "../components/AddTimeModal";

export const useAppTimeEntryModalState = () => {
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [addTimePrefill, setAddTimePrefill] = useState<AddTimePrefill | undefined>();
  const [editingWorklog, setEditingWorklog] = useState<JiraWorklog | undefined>();

  return {
    addModalDate,
    setAddModalDate,
    addTimePrefill,
    setAddTimePrefill,
    editingWorklog,
    setEditingWorklog
  };
};
