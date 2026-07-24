export type NotesBriefingKind = "risk" | "question" | "check";

export interface NotesBriefingInput {
  ticket: {
    key: string;
    summary: string;
    description?: string;
    comments?: string[];
  };
  pullRequest?: {
    id: number;
    title: string;
    diffstatSummary?: string;
  };
}

export interface NotesBriefingSuggestion {
  id: string;
  kind: NotesBriefingKind;
  text: string;
}

export const EMPTY_NOTES_BRIEFING: NotesBriefingSuggestion[] = [];

export const NOTES_BRIEFING_SYSTEM_PROMPT =
  "You are a cautious engineering briefing assistant. Use only the supplied Jira ticket and optional " +
  "Bitbucket diffstat evidence. Surface concrete risks, open questions, and checks without claiming " +
  "unverified facts or completion. Return only valid JSON.";

const MAX_COMMENTS = 20;
const MAX_DESCRIPTION_LENGTH = 8_000;
const MAX_COMMENT_LENGTH = 2_000;
const MAX_DIFFSTAT_LENGTH = 6_000;
const MAX_SUGGESTIONS = 8;
const MAX_SUGGESTION_LENGTH = 500;

const clean = (value: string | undefined, maxLength: number) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

/**
 * Builds the complete model input from remote Jira/Bitbucket evidence only.
 * Workspace notes are intentionally absent from the input type and serialized payload.
 */
export const buildNotesBriefingPrompt = (input: NotesBriefingInput) => {
  const ticketComments = (input.ticket.comments ?? [])
    .map((comment) => clean(comment, MAX_COMMENT_LENGTH))
    .filter((comment): comment is string => Boolean(comment))
    .slice(-MAX_COMMENTS);
  const evidence = {
    ticket: {
      key: input.ticket.key.trim().toLocaleUpperCase(),
      summary: clean(input.ticket.summary, 2_000) ?? "Untitled Jira issue",
      description: clean(input.ticket.description, MAX_DESCRIPTION_LENGTH),
      comments: ticketComments
    },
    ...(input.pullRequest
      ? {
          pullRequest: {
            id: input.pullRequest.id,
            title: clean(input.pullRequest.title, 2_000) ?? `Pull request #${input.pullRequest.id}`,
            diffstatSummary: clean(input.pullRequest.diffstatSummary, MAX_DIFFSTAT_LENGTH)
          }
        }
      : {})
  };

  return [
    "Create a short engineering briefing from the evidence below.",
    "Return this exact JSON shape:",
    '{"suggestions":[{"kind":"risk|question|check","text":"one concise, actionable sentence"}]}',
    `Return at most ${MAX_SUGGESTIONS} suggestions. Treat suggestions as hypotheses, not facts.`,
    "Do not invent scope, status, impact, owners, dates, metrics, or code changes.",
    "EVIDENCE JSON:",
    JSON.stringify(evidence)
  ].join("\n");
};

const jsonPayload = (responseText: string) => {
  const trimmed = responseText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
  const candidate = fenced ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace
    ? candidate.slice(firstBrace, lastBrace + 1)
    : candidate;
};

const normalizeKind = (value: unknown): NotesBriefingKind | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "risk" || normalized === "question" || normalized === "check"
    ? normalized
    : undefined;
};

export const parseNotesBriefing = (responseText: string): NotesBriefingSuggestion[] => {
  try {
    const parsed = JSON.parse(jsonPayload(responseText)) as {
      suggestions?: Array<{
        kind?: unknown;
        text?: unknown;
      }>;
    };

    if (!Array.isArray(parsed.suggestions)) {
      return [];
    }

    const suggestions: NotesBriefingSuggestion[] = [];
    const seen = new Set<string>();

    for (const candidate of parsed.suggestions) {
      const kind = normalizeKind(candidate?.kind);
      const text =
        typeof candidate?.text === "string"
          ? candidate.text.trim().replace(/\s+/g, " ").slice(0, MAX_SUGGESTION_LENGTH)
          : "";
      const duplicateKey = `${kind ?? ""}\u0000${text.toLocaleLowerCase()}`;

      if (!kind || !text || seen.has(duplicateKey)) {
        continue;
      }

      seen.add(duplicateKey);
      suggestions.push({
        id: `briefing-${suggestions.length + 1}`,
        kind,
        text
      });

      if (suggestions.length >= MAX_SUGGESTIONS) {
        break;
      }
    }

    return suggestions;
  } catch {
    return [];
  }
};
