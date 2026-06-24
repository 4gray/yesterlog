import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { PersonalNote } from "../../shared/types";
import {
  formatPersonalNoteCount,
  groupPersonalNotesByWeek,
  mergeImportedPersonalNotes,
  sortPersonalNotes,
  updateVisiblePersonalNotes
} from "./appHelpers";
import { parsePersonalNotesCsv } from "../domain/personalNotesCsv";
import {
  getPersonalNotes as getPersonalNotesFromStorage,
  savePersonalNotes as savePersonalNotesToStorage
} from "../storage/db";
import { getWeekBounds } from "../domain/week";
import { formatDuration, toLocalDateKey } from "../utils/date";

export interface PersonalNotePayload {
  title?: string;
  text: string;
  timeSpentSeconds: number;
  startedISO: string;
}

interface UsePersonalNotesOptions {
  personalNotes: PersonalNote[];
  setPersonalNotes: Dispatch<SetStateAction<PersonalNote[]>>;
  visibleWeekKey: string;
  isDemo: boolean;
  getPersonalNotes?: (weekKey: string) => Promise<PersonalNote[]>;
  savePersonalNotes?: (weekKey: string, notes: PersonalNote[]) => Promise<void>;
  setIsLogging: (isLogging: boolean) => void;
  setLogError: (message: string | undefined) => void;
  showInfo: (message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export const usePersonalNotes = ({
  personalNotes,
  setPersonalNotes,
  visibleWeekKey,
  isDemo,
  getPersonalNotes = getPersonalNotesFromStorage,
  savePersonalNotes = savePersonalNotesToStorage,
  setIsLogging,
  setLogError,
  showInfo,
  showSuccess,
  showError
}: UsePersonalNotesOptions) => {
  const [editingPersonalNote, setEditingPersonalNote] = useState<PersonalNote | undefined>();
  const [isImportingPersonalNotes, setIsImportingPersonalNotes] = useState(false);

  const handleImportPersonalNotes = useCallback(
    async (file: File) => {
      setIsImportingPersonalNotes(true);

      try {
        const importResult = parsePersonalNotesCsv(await file.text());

        if (importResult.notes.length === 0) {
          showError("No personal notes found. Import reads LOCAL-NOTE rows from exported weekly CSV files.");
          return;
        }

        const notesByWeek = groupPersonalNotesByWeek(importResult.notes);

        if (isDemo) {
          const visibleImportedNotes = notesByWeek.get(visibleWeekKey) ?? [];
          if (visibleImportedNotes.length === 0) {
            showInfo("The CSV has no personal notes for this demo week.");
            return;
          }

          const merged = mergeImportedPersonalNotes(personalNotes, visibleImportedNotes);
          setPersonalNotes(merged.notes);
          if (merged.addedCount > 0) {
            showSuccess(`Imported ${formatPersonalNoteCount(merged.addedCount)} into this demo week.`);
          } else {
            showInfo("No new personal notes imported; this demo week already has matching notes.");
          }
          return;
        }

        let addedCount = 0;
        let visibleWeekNotes: PersonalNote[] | undefined;

        for (const [weekKey, importedWeekNotes] of notesByWeek) {
          const storedWeekNotes = weekKey === visibleWeekKey ? personalNotes : await getPersonalNotes(weekKey);
          const merged = mergeImportedPersonalNotes(storedWeekNotes, importedWeekNotes);
          addedCount += merged.addedCount;

          if (merged.addedCount > 0) {
            await savePersonalNotes(weekKey, merged.notes);
          }

          if (weekKey === visibleWeekKey) {
            visibleWeekNotes = merged.notes;
          }
        }

        if (visibleWeekNotes) {
          setPersonalNotes(visibleWeekNotes);
        }

        if (addedCount > 0) {
          showSuccess(`Imported ${formatPersonalNoteCount(addedCount)} from ${file.name}.`);
        } else {
          showInfo("No new personal notes imported; stored notes already match that CSV.");
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to import personal notes from that CSV.");
      } finally {
        setIsImportingPersonalNotes(false);
      }
    },
    [
      getPersonalNotes,
      isDemo,
      personalNotes,
      savePersonalNotes,
      setPersonalNotes,
      showError,
      showInfo,
      showSuccess,
      visibleWeekKey
    ]
  );

  const handleAddPersonalNote = useCallback(
    async (payload: PersonalNotePayload) => {
      const started = new Date(payload.startedISO);
      const noteWeekKey = toLocalDateKey(getWeekBounds(started).weekStart);
      const now = new Date().toISOString();
      const note: PersonalNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        weekKey: noteWeekKey,
        dateKey: toLocalDateKey(started),
        title: payload.title?.trim() || undefined,
        text: payload.text.trim(),
        timeSpentSeconds: Math.round(payload.timeSpentSeconds),
        startedISO: payload.startedISO,
        createdAt: now,
        updatedAt: now
      };

      if (!note.text || note.timeSpentSeconds <= 0) {
        const message = "Add a note and a duration before saving.";
        setLogError(message);
        showError(message);
        return false;
      }

      try {
        if (isDemo) {
          setPersonalNotes((current) => [...current, note]);
          setLogError(undefined);
          showSuccess(`Demo saved ${formatDuration(note.timeSpentSeconds / 3600)} as a local note.`);
          return true;
        }

        const currentNotes = noteWeekKey === visibleWeekKey ? personalNotes : await getPersonalNotes(noteWeekKey);
        const nextNotes = sortPersonalNotes([...currentNotes, note]);
        await savePersonalNotes(noteWeekKey, nextNotes);
        if (noteWeekKey === visibleWeekKey) {
          setPersonalNotes(nextNotes);
        }
        setLogError(undefined);
        showSuccess(`Saved ${formatDuration(note.timeSpentSeconds / 3600)} as a local note.`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save the personal note locally.";
        setLogError(message);
        showError(message);
        return false;
      }
    },
    [
      getPersonalNotes,
      isDemo,
      personalNotes,
      savePersonalNotes,
      setLogError,
      setPersonalNotes,
      showError,
      showSuccess,
      visibleWeekKey
    ]
  );

  const handleUpdatePersonalNote = useCallback(
    async (payload: PersonalNotePayload) => {
      if (!editingPersonalNote) {
        return false;
      }

      const started = new Date(payload.startedISO);
      const noteWeekKey = toLocalDateKey(getWeekBounds(started).weekStart);
      const nextNote: PersonalNote = {
        ...editingPersonalNote,
        weekKey: noteWeekKey,
        dateKey: toLocalDateKey(started),
        title: payload.title?.trim() || undefined,
        text: payload.text.trim(),
        timeSpentSeconds: Math.round(payload.timeSpentSeconds),
        startedISO: payload.startedISO,
        updatedAt: new Date().toISOString()
      };

      if (!nextNote.text || nextNote.timeSpentSeconds <= 0) {
        const message = "Add a note and a duration before saving.";
        setLogError(message);
        showError(message);
        return false;
      }

      setIsLogging(true);
      setLogError(undefined);

      try {
        if (isDemo) {
          setPersonalNotes((current) =>
            updateVisiblePersonalNotes(current, editingPersonalNote, nextNote, visibleWeekKey)
          );
          showSuccess(`Demo updated ${formatDuration(nextNote.timeSpentSeconds / 3600)} local note.`);
          return true;
        }

        if (editingPersonalNote.weekKey === noteWeekKey) {
          const currentNotes =
            noteWeekKey === visibleWeekKey ? personalNotes : await getPersonalNotes(editingPersonalNote.weekKey);
          const nextNotes = sortPersonalNotes([
            ...currentNotes.filter((note) => note.id !== editingPersonalNote.id),
            nextNote
          ]);

          await savePersonalNotes(noteWeekKey, nextNotes);
          if (noteWeekKey === visibleWeekKey) {
            setPersonalNotes(nextNotes);
          }
        } else {
          const [previousWeekNotes, nextWeekNotes] = await Promise.all([
            editingPersonalNote.weekKey === visibleWeekKey
              ? Promise.resolve(personalNotes)
              : getPersonalNotes(editingPersonalNote.weekKey),
            noteWeekKey === visibleWeekKey ? Promise.resolve(personalNotes) : getPersonalNotes(noteWeekKey)
          ]);
          const previousWeekNextNotes = previousWeekNotes.filter((note) => note.id !== editingPersonalNote.id);
          const nextWeekNextNotes = sortPersonalNotes([
            ...nextWeekNotes.filter((note) => note.id !== editingPersonalNote.id),
            nextNote
          ]);

          await Promise.all([
            savePersonalNotes(editingPersonalNote.weekKey, previousWeekNextNotes),
            savePersonalNotes(noteWeekKey, nextWeekNextNotes)
          ]);

          if (editingPersonalNote.weekKey === visibleWeekKey) {
            setPersonalNotes(previousWeekNextNotes);
          } else if (noteWeekKey === visibleWeekKey) {
            setPersonalNotes(nextWeekNextNotes);
          }
        }

        showSuccess(`Updated ${formatDuration(nextNote.timeSpentSeconds / 3600)} local note.`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update the personal note locally.";
        setLogError(message);
        showError(message);
        return false;
      } finally {
        setIsLogging(false);
      }
    },
    [
      editingPersonalNote,
      getPersonalNotes,
      isDemo,
      personalNotes,
      savePersonalNotes,
      setIsLogging,
      setLogError,
      setPersonalNotes,
      showError,
      showSuccess,
      visibleWeekKey
    ]
  );

  const handleDeletePersonalNote = useCallback(async () => {
    if (!editingPersonalNote) {
      return false;
    }
    const note = editingPersonalNote;
    const remove = (list: PersonalNote[]) => list.filter((candidate) => candidate.id !== note.id);

    try {
      if (isDemo) {
        setPersonalNotes((current) => remove(current));
        showSuccess("Deleted the local note.");
        return true;
      }

      const current = note.weekKey === visibleWeekKey ? personalNotes : await getPersonalNotes(note.weekKey);
      const next = remove(current);
      await savePersonalNotes(note.weekKey, next);
      if (note.weekKey === visibleWeekKey) {
        setPersonalNotes(next);
      }
      showSuccess("Deleted the local note.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the personal note locally.";
      setLogError(message);
      showError(message);
      return false;
    }
  }, [
    editingPersonalNote,
    getPersonalNotes,
    isDemo,
    personalNotes,
    savePersonalNotes,
    setLogError,
    setPersonalNotes,
    showError,
    showSuccess,
    visibleWeekKey
  ]);

  return {
    editingPersonalNote,
    setEditingPersonalNote,
    isImportingPersonalNotes,
    handleImportPersonalNotes,
    handleAddPersonalNote,
    handleUpdatePersonalNote,
    handleDeletePersonalNote
  };
};
