import type { RecapDraftVersion, RecapFormat, RecapTheme } from "../../shared/types";

export const RECAP_WORKSPACE_SYSTEM_PROMPT =
  "You turn a developer's real work evidence into concise review-ready writing. Never invent impact, numbers, scope, or sources. Preserve every supplied theme id and source reference. Return JSON only.";

export const buildRecapWorkspacePrompt = (draft: RecapDraftVersion) =>
  [
    "Rewrite the copy for all five formats: perf, manager, cv, standup, changelog.",
    "Each line must cite one or more refs from its theme. Changelog tags are Added, Changed, or Fixed.",
    "Do not change metrics, theme ids, or source assignments.",
    "Return {themes:[{id,name,copy:{perf:{lead,lines},manager:{lead,lines},cv:{lines},standup:{lead,lines},changelog:{version,lines}}}]}",
    "Every line is {id,short,long,refs,tag?,emphasis?}.",
    "FACTS:",
    JSON.stringify({
      interval: draft.interval,
      themes: draft.themes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        metrics: { hours: theme.hours, prs: theme.pullRequestCount, tickets: theme.ticketCount },
        allowedRefs: draft.sources.filter((source) => theme.sourceIds.includes(source.id)).map((source) => ({
          ref: source.issueKey || (source.pullRequestId ? `#${source.pullRequestId}` : source.id),
          title: source.title,
          detail: source.detail,
          minutes: Math.round(source.timeSpentSeconds / 60)
        }))
      }))
    })
  ].join("\n");

const FORMATS: RecapFormat[] = ["perf", "manager", "cv", "standup", "changelog"];
const TAGS = new Set(["Added", "Changed", "Fixed"]);
const numericTokens = (value: string) => value.match(/\b\d+(?:\.\d+)?\b/g) ?? [];

const allowedNumbersForTheme = (theme: RecapTheme, fallback: RecapDraftVersion) => {
  const values = [
    String(theme.hours),
    String(Math.round(theme.hours * 10) / 10),
    String(theme.pullRequestCount),
    String(theme.ticketCount),
    theme.name,
    fallback.interval.label,
    fallback.interval.startDateKey,
    fallback.interval.endDateKeyExclusive
  ];
  for (const source of fallback.sources.filter((item) => theme.sourceIds.includes(item.id))) {
    values.push(
      source.issueKey ?? "",
      source.pullRequestId ? `#${source.pullRequestId}` : "",
      source.title,
      source.detail ?? "",
      String(Math.round(source.timeSpentSeconds / 60)),
      String(Math.round((source.timeSpentSeconds / 3600) * 10) / 10)
    );
  }
  return new Set(values.flatMap(numericTokens));
};

const validateNumbers = (values: Array<string | undefined>, allowed: Set<string>) => {
  const claims = values.filter(Boolean).flatMap((value) => numericTokens(value!));
  if (claims.some((claim) => !allowed.has(claim))) throw new Error("unsupported numeric claim");
};

export const parseRecapWorkspaceDraft = (raw: string, fallback: RecapDraftVersion): RecapDraftVersion | undefined => {
  try {
    const parsed = JSON.parse(raw) as { themes?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.themes)) return undefined;
    const byId = new Map(parsed.themes.map((theme) => [String(theme.id ?? ""), theme]));
    const themes: RecapTheme[] = fallback.themes.map((base) => {
      const incoming = byId.get(base.id);
      if (!incoming || typeof incoming.copy !== "object" || !incoming.copy) throw new Error("missing theme");
      const allowed = new Set(
        fallback.sources
          .filter((source) => base.sourceIds.includes(source.id))
          .map((source) => source.issueKey || (source.pullRequestId ? `#${source.pullRequestId}` : source.id))
      );
      const allowedNumbers = allowedNumbersForTheme(base, fallback);
      const name = typeof incoming.name === "string" && incoming.name.trim() ? incoming.name.trim() : base.name;
      validateNumbers([name], allowedNumbers);
      const copy = { ...base.copy };
      for (const format of FORMATS) {
        const block = (incoming.copy as Record<string, unknown>)[format] as Record<string, unknown> | undefined;
        if (!block || !Array.isArray(block.lines)) throw new Error("missing format");
        const lines = block.lines.map((lineValue, index) => {
          const line = lineValue as Record<string, unknown>;
          const refs = Array.isArray(line.refs) ? line.refs.map(String) : [];
          if (!refs.length || refs.some((ref) => !allowed.has(ref))) throw new Error("invalid refs");
          const tag = line.tag ? String(line.tag) : undefined;
          if ((format === "changelog" && (!tag || !TAGS.has(tag))) || (tag && !TAGS.has(tag))) throw new Error("invalid tag");
          const short = String(line.short ?? "").trim();
          const long = String(line.long ?? "").trim();
          if (!short || !long) throw new Error("empty copy");
          validateNumbers([short, long, line.emphasis ? String(line.emphasis) : undefined], allowedNumbers);
          return {
            id: String(line.id ?? `${base.id}:${format}:${index}`),
            short,
            long,
            refs,
            tag: tag as "Added" | "Changed" | "Fixed" | undefined,
            emphasis: line.emphasis ? String(line.emphasis) : undefined
          };
        });
        const lead = block.lead ? String(block.lead) : undefined;
        const version = block.version ? String(block.version) : undefined;
        validateNumbers([lead, version], allowedNumbers);
        copy[format] = {
          lead,
          version,
          lines
        };
      }
      return { ...base, name, copy };
    });
    return { ...fallback, generator: "ai", themes };
  } catch {
    return undefined;
  }
};
