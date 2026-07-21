/**
 * Prompt for the optional, on-device "Polish" step: turn the deterministic
 * recap list into 2–3 spoken sentences for standup. Pure string building — the
 * facade in `api/ollama.ts` owns the call and the graceful fallback to the list.
 */

export const RECAP_POLISH_SYSTEM_PROMPT =
  "You are a standup assistant. Rewrite the factual list of yesterday's work into 2-3 " +
  "natural, first-person spoken sentences for a daily standup update. Never invent work, " +
  "numbers, or details that are not in the list. Preserve any TICKET-n and [redacted-…] " +
  "tokens exactly as written. Reply with prose only — no lists, no markdown, no preamble.";

export const buildRecapPolishPrompt = (recapText: string): string =>
  [
    "Here is what I did yesterday (a factual list):",
    "",
    recapText,
    "",
    "Rewrite it as 2-3 spoken sentences I can say in standup."
  ].join("\n");
