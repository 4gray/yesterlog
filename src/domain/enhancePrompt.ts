import type { ReconstructDay } from "./reconstruct";

/**
 * Pure prompt-building and response-parsing for the optional local-AI layer.
 *
 * Kept free of any I/O so it can be unit-tested without a running model. Drafts are keyed
 * by **signal id** (not hour), so they survive drag/drop re-positioning and can be cached
 * and re-applied without re-running the model. Gap inferences are keyed by hour. Any parse
 * failure yields empty maps — the deterministic reconstruction is always the floor.
 */

export interface AiDrafts {
  /** signalId → clean worklog sentence. */
  entries: Record<string, string>;
  /** "HH:00" → inferred gap note. */
  gaps: Record<string, string>;
}

export const EMPTY_AI_DRAFTS: AiDrafts = { entries: {}, gaps: {} };

export const ENHANCE_SYSTEM_PROMPT =
  "You are a senior developer's worklog assistant. You rewrite terse, factual development " +
  "signals (commit subjects, PR titles, review notes) into short, clear worklog descriptions " +
  "a manager could read. One sentence per entry. Never invent work that is not implied by the " +
  "signal. Preserve any TICKET-n and [redacted-…] tokens exactly as written. Reply with JSON " +
  "only — no prose, no code fences.";

/** Builds the user prompt sent to the model for a single day. */
export const buildEnhancePrompt = (day: ReconstructDay): string => {
  const entries = day.signals
    .filter((signal) => !signal.isMarker && signal.durationMinutes > 0)
    .map((signal) => ({
      id: signal.id,
      key: signal.key,
      signal: signal.naiveDescription || signal.title,
      minutes: signal.durationMinutes
    }));
  const gaps = day.rows
    .filter((row) => row.kind === "empty")
    .map((row, index, all) => ({ hour: row.hour, neighbours: neighbourContext(day, row, index === 0, index === all.length - 1) }));

  return [
    `Reconstruct the worklog for ${day.dateKey}.`,
    "Rewrite each entry's `signal` into one clean worklog sentence (field `draft`), keeping its `id`.",
    "For each gap, infer in one short sentence what likely happened from the neighbouring entries (field `text`); only if plausible.",
    "Respond with exactly this JSON shape:",
    '{"entries":[{"id":"...","draft":"..."}],"gaps":[{"hour":"12:00","text":"..."}]}',
    "",
    "ENTRIES:",
    JSON.stringify(entries),
    "GAPS:",
    JSON.stringify(gaps)
  ].join("\n");
};

const neighbourContext = (day: ReconstructDay, gap: { hour: string }, _first: boolean, _last: boolean): string => {
  const index = day.rows.findIndex((row) => row === gap || (row.kind === "empty" && row.hour === gap.hour));
  const before = [...day.rows.slice(0, index)].reverse().find((row) => row.kind !== "empty");
  const after = day.rows.slice(index + 1).find((row) => row.kind !== "empty");
  return [before, after]
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => {
      if (row.lockedSource === "personal-note") {
        return `${row.hour} local private note`;
      }
      if (row.lockedSource === "recurring") {
        return `${row.hour} local event ${row.title}`.trim();
      }
      return `${row.hour} ${row.key} ${row.title}`.trim();
    })
    .join(" → ");
};

/** Extracts the outermost JSON object from a possibly noisy model completion. */
const extractJsonObject = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Parses a model completion into signal-keyed drafts + hour-keyed gap notes. Any parse or
 * shape failure yields empty maps.
 */
export const parseAiDrafts = (responseText: string): AiDrafts => {
  const parsed = extractJsonObject(responseText);
  if (!parsed || typeof parsed !== "object") {
    return EMPTY_AI_DRAFTS;
  }
  const record = parsed as Record<string, unknown>;

  const entries: Record<string, string> = {};
  for (const item of asArray(record.entries)) {
    const entry = item as Record<string, unknown>;
    if (typeof entry?.id === "string" && typeof entry?.draft === "string" && entry.draft.trim()) {
      entries[entry.id] = entry.draft.trim();
    }
  }

  const gaps: Record<string, string> = {};
  for (const item of asArray(record.gaps)) {
    const gap = item as Record<string, unknown>;
    if (typeof gap?.hour === "string" && typeof gap?.text === "string" && gap.text.trim()) {
      gaps[gap.hour] = gap.text.trim();
    }
  }

  return { entries, gaps };
};

/** Overlays cached drafts onto a day's rows (by signal id / hour). Pure. */
export const applyAiDrafts = (day: ReconstructDay, drafts: AiDrafts): ReconstructDay => {
  if (Object.keys(drafts.entries).length === 0 && Object.keys(drafts.gaps).length === 0) {
    return day;
  }
  return {
    ...day,
    rows: day.rows.map((row) => {
      if (row.kind === "filled" && row.signalId && drafts.entries[row.signalId]) {
        return { ...row, aiDraft: drafts.entries[row.signalId] };
      }
      if (row.kind === "empty" && drafts.gaps[row.hour]) {
        return { ...row, gapText: drafts.gaps[row.hour] };
      }
      return row;
    })
  };
};
