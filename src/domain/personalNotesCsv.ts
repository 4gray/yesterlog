import type { PersonalNote } from "../../shared/types";
import { fromLocalDateKey, startOfWeekMonday, toLocalDateKey } from "../utils/date";

const LOCAL_NOTE_KEYS = new Set(["LOCAL-NOTE", "LOCAL"]);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PersonalNotesCsvImportResult {
  notes: PersonalNote[];
  ignoredRows: number;
}

interface PersonalNotesCsvImportOptions {
  importedAtISO?: string;
  idPrefix?: string;
}

const pushCsvRow = (rows: string[][], row: string[], field: string) => {
  const completedRow = [...row, field];
  if (completedRow.length > 1 || completedRow[0].trim()) {
    rows.push(completedRow);
  }
};

const parseCsvRows = (csvText: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      pushCsvRow(rows, row, field);
      row = [];
      field = "";
    } else if (char === "\r") {
      pushCsvRow(rows, row, field);
      row = [];
      field = "";
      if (csvText[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field.");
  }

  if (row.length > 0 || field.trim()) {
    pushCsvRow(rows, row, field);
  }

  return rows;
};

const getColumnIndex = (header: string[], columnName: string) => {
  return header.findIndex((column) => column.trim().toLowerCase() === columnName);
};

const parseDateKey = (dateKey: string, rowNumber: number) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error(`Row ${rowNumber}: personal note date must use YYYY-MM-DD.`);
  }

  const date = fromLocalDateKey(dateKey);
  if (toLocalDateKey(date) !== dateKey) {
    throw new Error(`Row ${rowNumber}: personal note date is invalid.`);
  }

  return date;
};

const createStartedAt = (dateKey: string, noteIndexForDate: number) => {
  const startedAt = fromLocalDateKey(dateKey);
  startedAt.setHours(9 + Math.floor(noteIndexForDate / 4), (noteIndexForDate % 4) * 15, 0, 0);
  return startedAt.toISOString();
};

export const parsePersonalNotesCsv = (
  csvText: string,
  options: PersonalNotesCsvImportOptions = {}
): PersonalNotesCsvImportResult => {
  const rows = parseCsvRows(csvText.replace(/^\uFEFF/, ""));
  const header = rows[0] ?? [];
  const dateIndex = getColumnIndex(header, "date");
  const issueIndex = getColumnIndex(header, "issue");
  const summaryIndex = getColumnIndex(header, "summary");
  const hoursIndex = getColumnIndex(header, "hours");
  const titleIndex = getColumnIndex(header, "title");

  if ([dateIndex, issueIndex, summaryIndex, hoursIndex].some((index) => index < 0)) {
    throw new Error("CSV must include Date, Issue, Summary, and Hours columns.");
  }

  const importedAtISO = options.importedAtISO ?? new Date().toISOString();
  const idPrefix = options.idPrefix ?? `note-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const noteCountsByDate = new Map<string, number>();
  const notes: PersonalNote[] = [];
  let ignoredRows = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowNumber = rowIndex + 1;
    const issueKey = (row[issueIndex] ?? "").trim().toUpperCase();

    if (!LOCAL_NOTE_KEYS.has(issueKey)) {
      ignoredRows += 1;
      continue;
    }

    const dateKey = (row[dateIndex] ?? "").trim();
    const date = parseDateKey(dateKey, rowNumber);
    const text = (row[summaryIndex] ?? "").trim();
    const title = titleIndex >= 0 ? (row[titleIndex] ?? "").trim() : "";
    const hours = Number((row[hoursIndex] ?? "").trim());

    if (!text) {
      throw new Error(`Row ${rowNumber}: personal note summary is empty.`);
    }

    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error(`Row ${rowNumber}: personal note hours must be a positive number.`);
    }

    const noteIndexForDate = noteCountsByDate.get(dateKey) ?? 0;
    noteCountsByDate.set(dateKey, noteIndexForDate + 1);

    notes.push({
      id: `${idPrefix}-${rowNumber}`,
      weekKey: toLocalDateKey(startOfWeekMonday(date)),
      dateKey,
      title: title || undefined,
      text,
      timeSpentSeconds: Math.round(hours * 3600),
      startedISO: createStartedAt(dateKey, noteIndexForDate),
      createdAt: importedAtISO,
      updatedAt: importedAtISO
    });
  }

  return {
    notes: notes.sort((left, right) => new Date(left.startedISO).getTime() - new Date(right.startedISO).getTime()),
    ignoredRows
  };
};
