import type { JiraWorklog, PersonalNote } from "../../shared/types";
import { AddTimeModal, type AddTimeModalProps } from "./AddTimeModal";

interface TimeEntryModalLayerProps {
  addModalDate?: Date;
  addTimePrefill?: AddTimeModalProps["prefill"];
  editingWorklog?: JiraWorklog;
  editingPersonalNote?: PersonalNote;
  dateOptions: AddTimeModalProps["dateOptions"];
  ticketOptions: AddTimeModalProps["ticketOptions"];
  isConfigured: boolean;
  isLogging: boolean;
  isDeletingWorklog: boolean;
  dailyTargetHours?: AddTimeModalProps["dailyTargetHours"];
  logError?: string;
  onCloseAddTime: AddTimeModalProps["onClose"];
  onCloseEditingWorklog: AddTimeModalProps["onClose"];
  onCloseEditingPersonalNote: AddTimeModalProps["onClose"];
  onAddWorklog: AddTimeModalProps["onLog"];
  onUpdateWorklog: AddTimeModalProps["onLog"];
  onDeleteWorklog: NonNullable<AddTimeModalProps["onDelete"]>;
  onSearchTickets: AddTimeModalProps["onSearchTickets"];
  onAddPersonalNote: AddTimeModalProps["onAddPersonalNote"];
  onUpdatePersonalNote: AddTimeModalProps["onUpdatePersonalNote"];
  onDeletePersonalNote: NonNullable<AddTimeModalProps["onDelete"]>;
  getRecurringCandidates: AddTimeModalProps["getRecurringCandidates"];
  onLogRecurring: AddTimeModalProps["onLogRecurring"];
}

export const TimeEntryModalLayer = ({
  addModalDate,
  addTimePrefill,
  editingWorklog,
  editingPersonalNote,
  dateOptions,
  ticketOptions,
  isConfigured,
  isLogging,
  isDeletingWorklog,
  dailyTargetHours,
  logError,
  onCloseAddTime,
  onCloseEditingWorklog,
  onCloseEditingPersonalNote,
  onAddWorklog,
  onUpdateWorklog,
  onDeleteWorklog,
  onSearchTickets,
  onAddPersonalNote,
  onUpdatePersonalNote,
  onDeletePersonalNote,
  getRecurringCandidates,
  onLogRecurring
}: TimeEntryModalLayerProps) => (
  <>
    {addModalDate && (
      <AddTimeModal
        date={addModalDate}
        dateOptions={dateOptions}
        ticketOptions={ticketOptions}
        isConfigured={isConfigured}
        isLogging={isLogging}
        dailyTargetHours={dailyTargetHours}
        logError={logError}
        prefill={addTimePrefill}
        onClose={onCloseAddTime}
        onLog={onAddWorklog}
        onSearchTickets={onSearchTickets}
        onAddPersonalNote={onAddPersonalNote}
        getRecurringCandidates={getRecurringCandidates}
        onLogRecurring={onLogRecurring}
      />
    )}

    {editingWorklog && (
      <AddTimeModal
        date={new Date(editingWorklog.started)}
        dateOptions={dateOptions}
        ticketOptions={ticketOptions}
        isConfigured={isConfigured}
        isLogging={isLogging}
        isDeleting={isDeletingWorklog}
        dailyTargetHours={dailyTargetHours}
        logError={logError}
        editingWorklog={editingWorklog}
        onClose={onCloseEditingWorklog}
        onLog={onUpdateWorklog}
        onDelete={onDeleteWorklog}
        onSearchTickets={onSearchTickets}
        onAddPersonalNote={onAddPersonalNote}
      />
    )}

    {editingPersonalNote && (
      <AddTimeModal
        date={new Date(editingPersonalNote.startedISO)}
        dateOptions={dateOptions}
        ticketOptions={ticketOptions}
        isConfigured={isConfigured}
        isLogging={isLogging}
        dailyTargetHours={dailyTargetHours}
        logError={logError}
        editingPersonalNote={editingPersonalNote}
        onClose={onCloseEditingPersonalNote}
        onLog={onAddWorklog}
        onDelete={onDeletePersonalNote}
        onSearchTickets={onSearchTickets}
        onAddPersonalNote={onAddPersonalNote}
        onUpdatePersonalNote={onUpdatePersonalNote}
      />
    )}
  </>
);
