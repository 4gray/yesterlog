import type {
  RecapCopyLine,
  RecapCopyParagraph,
  RecapDetail,
  RecapDraftVersion,
  RecapFormat,
  RecapTheme
} from "../../shared/types";
import { recapSourceRef } from "./recapWorkspace";

export const RECAP_WORKSPACE_SYSTEM_PROMPT = [
  "You are an evidence editor for a developer's private work journal.",
  "Turn real activity into clear review-ready writing without inventing impact, completion, ownership, numbers, scope, or sources.",
  "Do not say shipped, delivered, fixed, improved, led, or owned unless the supplied evidence explicitly supports that claim.",
  "Separate recorded work from business outcomes. If an outcome is missing, say so through needsImpact instead of making one up.",
  "Treat USER CLAIMS as trusted personal evidence. Preserve them exactly as separate userImpact data and never invent or weaken them.",
  "Preserve every supplied theme id and cite only allowed refs. Return JSON only."
].join(" ");

const FORMAT_INSTRUCTIONS: Record<RecapFormat, string[]> = {
  perf: [
    "Write a performance-review narrative for the person doing the work.",
    "Use a concrete workstream name, a factual lead, and connected paragraphs rather than a ticket-by-ticket list.",
    "Explain scope, contribution, collaboration, and recorded outcomes only when evidence supports them.",
    "Lines are optional evidence highlights, not the main document."
  ],
  manager: [
    "Write a plain first-person manager update.",
    "Use connected paragraphs that explain where time and attention went.",
    "Do not turn every source into a bullet. Lines are optional supporting highlights."
  ],
  cv: [
    "Write accomplishment candidates for a CV or professional profile.",
    "Combine related sources into one or two action-oriented bullets per workstream and omit internal Jira keys from the prose.",
    "Set needsImpact to true whenever the evidence does not contain a measurable or explicit outcome. Never fabricate one.",
    "Return no paragraphs."
  ],
  standup: [
    "Write a terse standup digest.",
    "Use one short factual bullet per meaningful thread and avoid review-style prose.",
    "Return no paragraphs."
  ],
  changelog: [
    "Write release-style change entries grouped by product or module.",
    "Use Added, Changed, or Fixed only when the evidence supports the classification. Omit tag when uncertain.",
    "Do not mention time spent. Return no paragraphs."
  ]
};

const DETAIL_INSTRUCTIONS: Record<RecapDetail, string> = {
  headline: "Headline mode: write only a useful lead and the minimum copy required by the format.",
  balanced: "Standard mode: for narrative formats write one paragraph of 2 to 4 sentences; for list formats keep only the strongest items.",
  detailed: "Detailed mode: for narrative formats write 2 or 3 paragraphs of 2 to 4 complete sentences each, then up to 4 evidence highlights; for list formats add useful context without repeating source metadata."
};

export const buildRecapWorkspacePrompt = (
  draft: RecapDraftVersion,
  format: RecapFormat,
  detail: RecapDetail
) => [
  `Write only the ${format} format at ${detail} detail.`,
  ...FORMAT_INSTRUCTIONS[format],
  DETAIL_INSTRUCTIONS[detail],
  "You may rename a theme to a clearer product, module, or workstream name using supplied context, but do not change theme ids or move refs between themes.",
  "When coverage is partial or sparse, qualify period-wide statements and describe only the available history.",
  "Return {format,themes:[{id,name,copy:{lead?,version?,paragraphs?,lines}}]}.",
  "Every paragraph is {id,text,refs}. Every line is {id,short,long,refs,tag?,emphasis?,needsImpact?}.",
  "USER CLAIMS are stored separately by the app. Use them to understand the evidence, but do not repeat their text in short or long.",
  "Every paragraph and line must cite one or more allowed refs from its theme. Return paragraphs as [] for cv, standup, and changelog.",
  "FACTS:",
  JSON.stringify({
    interval: draft.interval,
    coverage: draft.coverage,
    themes: draft.themes.map((theme) => ({
      id: theme.id,
      suggestedName: theme.name,
      metrics: { hours: theme.hours, prs: theme.pullRequestCount, tickets: theme.ticketCount },
      userClaims: theme.copy.cv.lines
        .filter((line) => line.userImpact?.trim())
        .map((line) => ({ lineId: line.id, refs: line.refs, userImpact: line.userImpact })),
      evidence: draft.sources.filter((source) => theme.sourceIds.includes(source.id)).map((source) => ({
        sourceId: source.id,
        ref: recapSourceRef(source),
        kind: source.kind,
        dates: source.dateKeys ?? [source.dateKey],
        title: source.title,
        notes: source.details ?? (source.detail ? [source.detail] : []),
        minutes: Math.round(source.timeSpentSeconds / 60),
        issueKey: source.issueKey,
        epic: source.epicSummary ?? source.epicKey,
        project: source.projectName ?? source.projectKey,
        components: source.components,
        repository: source.repository,
        pullRequestId: source.pullRequestId,
        role: source.role,
        status: source.status
      }))
    }))
  })
].join("\n");

const TAGS = new Set(["Added", "Changed", "Fixed"]);
const numericTokens = (value: string) => value.match(/\b\d+(?:\.\d+)?\b/g) ?? [];

const allowedNumbersForTheme = (theme: RecapTheme, fallback: RecapDraftVersion) => {
  const totalMinutes = Math.round(theme.hours * 60);
  const values = [
    String(theme.hours),
    String(Math.round(theme.hours * 10) / 10),
    String(Math.round(theme.hours)),
    String(totalMinutes),
    String(theme.pullRequestCount),
    String(theme.ticketCount),
    theme.name,
    fallback.interval.label,
    fallback.interval.startDateKey,
    fallback.interval.endDateKeyExclusive,
    String(fallback.coverage.requestedWeeks),
    String(fallback.coverage.elapsedWeeks ?? fallback.coverage.requestedWeeks),
    String(fallback.coverage.jiraWeeks),
    String(fallback.coverage.bitbucketWeeks)
  ];
  for (const source of fallback.sources.filter((item) => theme.sourceIds.includes(item.id))) {
    values.push(
      source.issueKey ?? "",
      source.pullRequestId ? recapSourceRef(source) : "",
      source.title,
      ...(source.details ?? (source.detail ? [source.detail] : [])),
      String(Math.round(source.timeSpentSeconds / 60)),
      String(Math.round(source.timeSpentSeconds / 3600)),
      String(Math.round((source.timeSpentSeconds / 3600) * 10) / 10)
    );
  }
  for (const line of theme.copy.cv.lines) values.push(line.userImpact ?? "");
  return new Set(values.flatMap(numericTokens));
};

const validateNumbers = (values: Array<string | undefined>, allowed: Set<string>) => {
  const claims = values.filter(Boolean).flatMap((value) => numericTokens(value!));
  if (claims.some((claim) => !allowed.has(claim))) throw new Error("unsupported numeric claim");
};

const validatedRefs = (value: unknown, allowed: Set<string>) => {
  const refs = Array.isArray(value) ? value.map(String) : [];
  if (!refs.length || refs.some((ref) => !allowed.has(ref))) throw new Error("invalid refs");
  return refs;
};

const parseParagraphs = (
  value: unknown,
  allowed: Set<string>,
  allowedNumbers: Set<string>,
  themeId: string,
  format: RecapFormat
): RecapCopyParagraph[] => {
  if (!Array.isArray(value)) return [];
  return value.map((paragraphValue, index) => {
    const paragraph = paragraphValue as Record<string, unknown>;
    const text = String(paragraph.text ?? "").trim();
    if (!text) throw new Error("empty paragraph");
    validateNumbers([text], allowedNumbers);
    return {
      id: String(paragraph.id ?? `${themeId}:${format}:paragraph:${index}`),
      text,
      refs: validatedRefs(paragraph.refs, allowed)
    };
  });
};

const parseLines = (
  value: unknown,
  allowed: Set<string>,
  allowedNumbers: Set<string>,
  themeId: string,
  format: RecapFormat,
  existingLines: RecapCopyLine[]
): RecapCopyLine[] => {
  if (!Array.isArray(value)) throw new Error("missing lines");
  const parsedLines = value.map((lineValue, index): RecapCopyLine => {
    const line = lineValue as Record<string, unknown>;
    const tag = line.tag ? String(line.tag) : undefined;
    if (tag && !TAGS.has(tag)) throw new Error("invalid tag");
    if (format !== "changelog" && tag) throw new Error("unexpected tag");
    const short = String(line.short ?? "").trim();
    const long = String(line.long ?? "").trim();
    if (!short || !long) throw new Error("empty copy");
    const emphasis = line.emphasis ? String(line.emphasis) : undefined;
    validateNumbers([short, long, emphasis], allowedNumbers);
    const refs = validatedRefs(line.refs, allowed);
    return {
      id: String(line.id ?? `${themeId}:${format}:line:${index}`),
      short,
      long,
      refs,
      tag: tag as RecapCopyLine["tag"],
      emphasis,
      needsImpact: format === "cv" ? line.needsImpact !== false : undefined
    };
  });
  if (format !== "cv") return parsedLines;

  const existingImpacts = existingLines.filter((line) => line.userImpact?.trim());
  const matches = existingImpacts.flatMap((existing, existingIndex) => parsedLines.flatMap((incoming, incomingIndex) => {
    const overlap = existing.refs.filter((ref) => incoming.refs.includes(ref)).length;
    if (!overlap) return [];
    const exactRefs = existing.refs.length === incoming.refs.length
      && existing.refs.every((ref) => incoming.refs.includes(ref));
    const score = (existing.id === incoming.id ? 1_000_000 : 0) + (exactRefs ? 10_000 : 0) + overlap;
    return [{ existingIndex, incomingIndex, score }];
  })).sort((a, b) => b.score - a.score || a.incomingIndex - b.incomingIndex || a.existingIndex - b.existingIndex);
  const assignedExisting = new Set<number>();
  const assignedIncoming = new Set<number>();
  const impactByIncoming = new Map<number, string>();
  for (const match of matches) {
    if (assignedExisting.has(match.existingIndex) || assignedIncoming.has(match.incomingIndex)) continue;
    assignedExisting.add(match.existingIndex);
    assignedIncoming.add(match.incomingIndex);
    impactByIncoming.set(match.incomingIndex, existingImpacts[match.existingIndex].userImpact!);
  }
  return parsedLines.map((line, index) => {
    const userImpact = impactByIncoming.get(index);
    return { ...line, needsImpact: userImpact ? false : line.needsImpact, userImpact };
  });
};

export const parseRecapWorkspaceDraft = (
  raw: string,
  fallback: RecapDraftVersion,
  format: RecapFormat,
  detail: RecapDetail
): RecapDraftVersion | undefined => {
  try {
    const parsed = JSON.parse(raw) as { format?: string; themes?: Array<Record<string, unknown>> };
    if (parsed.format !== format || !Array.isArray(parsed.themes)) return undefined;
    const byId = new Map(parsed.themes.map((theme) => [String(theme.id ?? ""), theme]));
    const themes: RecapTheme[] = fallback.themes.map((base) => {
      const incoming = byId.get(base.id);
      if (!incoming || typeof incoming.copy !== "object" || !incoming.copy) throw new Error("missing theme");
      const allowed = new Set(
        fallback.sources
          .filter((source) => base.sourceIds.includes(source.id))
          .map(recapSourceRef)
      );
      const allowedNumbers = allowedNumbersForTheme(base, fallback);
      const name = typeof incoming.name === "string" && incoming.name.trim() ? incoming.name.trim() : base.name;
      validateNumbers([name], allowedNumbers);
      const block = incoming.copy as Record<string, unknown>;
      const lead = block.lead ? String(block.lead).trim() : undefined;
      const version = block.version ? String(block.version).trim() : undefined;
      validateNumbers([lead, version], allowedNumbers);
      const paragraphs = parseParagraphs(block.paragraphs, allowed, allowedNumbers, base.id, format);
      if ((format === "perf" || format === "manager") && detail !== "headline" && !paragraphs.length) throw new Error("missing narrative");
      if (format !== "perf" && format !== "manager" && paragraphs.length) throw new Error("unexpected narrative");
      const copy = {
        ...base.copy,
        [format]: {
          lead,
          version,
          paragraphs,
          lines: parseLines(block.lines, allowed, allowedNumbers, base.id, format, base.copy[format].lines)
        }
      };
      return { ...base, name, copy };
    });
    if (byId.size !== fallback.themes.length) return undefined;
    return {
      ...fallback,
      generator: "ai",
      aiFormats: Array.from(new Set([...(fallback.aiFormats ?? []), format])),
      themes
    };
  } catch {
    return undefined;
  }
};
