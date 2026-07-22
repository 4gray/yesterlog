/**
 * Best-effort redaction of a prompt before it is sent to a **cloud** AI provider
 * (Claude / Codex CLI). Ollama stays on-device and is never redacted.
 *
 * What it scrubs, and how:
 *  - URLs, emails, and `@mentions` → replaced with fixed markers (not reversible; they
 *    should never appear in a one-line worklog rewrite anyway).
 *  - Caller-supplied literals (Bitbucket workspace/repo slugs, the Jira company subdomain,
 *    configured emails) → `[redacted]`, matched on word boundaries so a short slug can't
 *    corrupt an unrelated substring.
 *  - Caller-supplied reversible tokens (opaque signal ids, which embed workspace/repo/PR
 *    identifiers) → stable `ID-1`, `ID-2`, … restored in the model's response.
 *  - Jira-style ticket keys (`TBRO-395`) → stable placeholders `TICKET-1`, `TICKET-2`, … and
 *    a `restore()` maps them back in the model's response, so the user still sees real keys.
 *
 * This reduces identifiability; it is NOT a guarantee. A person's name typed into a commit
 * message, comment body, or personal note is free text and cannot be detected by pattern —
 * that text is still sent (with URLs/emails/mentions/keys within it scrubbed). Short (<4 char)
 * company identifiers are also not scrubbed, because redacting 2–3 char tokens would mangle
 * common words.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]]+/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const MENTION_RE = /@[A-Za-z0-9][\w.-]{1,29}/g;
const TICKET_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

/**
 * Prefixes that look like Jira keys but are common technical tokens, not tickets. They are
 * left untouched (they carry no company identity, and mangling them would hurt the rewrite).
 * `ID` is here so the reversible `ID-n` placeholders are never re-matched as ticket keys.
 */
const NON_TICKET_PREFIXES = new Set([
  "ID",
  "UTF",
  "SHA",
  "MD",
  "ISO",
  "RFC",
  "AES",
  "RSA",
  "TLS",
  "SSL",
  "IPV",
  "CVE",
  "PEP",
  "ES",
  "GPT",
  "COVID"
]);

export interface CloudRedaction {
  /** The prompt with sensitive tokens replaced. */
  text: string;
  /** Maps `TICKET-n` / `ID-n` placeholders in a model response back to the real values. */
  restore: (response: string) => string;
  /** How many tokens were replaced (0 → nothing sensitive matched). */
  redactedCount: number;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Dedupe, drop short/empty entries, longest first so nested slugs redact before substrings. */
const prepareLiterals = (literals: string[], minLength: number): string[] =>
  Array.from(new Set(literals.map((value) => value.trim()).filter((value) => value.length >= minLength))).sort(
    (a, b) => b.length - a.length
  );

export const redactForCloud = (
  input: string,
  extraLiterals: string[] = [],
  reversibleTokens: string[] = []
): CloudRedaction => {
  let count = 0;
  const bump = <T>(replacement: T): T => {
    count += 1;
    return replacement;
  };

  let text = input;

  // Reversible opaque tokens (signal ids) FIRST, so their embedded workspace/repo/PR
  // substrings are gone before the literal/ticket passes, and the `ID-n` placeholders
  // survive (the ticket regex skips the `ID` prefix). Matched case-sensitively & exactly.
  const idNumberToToken = new Map<string, string>();
  const tokenToPlaceholder = new Map<string, string>();
  for (const token of prepareLiterals(reversibleTokens, 1)) {
    text = text.replace(new RegExp(escapeRegExp(token), "g"), () => {
      let placeholder = tokenToPlaceholder.get(token);
      if (!placeholder) {
        const n = String(tokenToPlaceholder.size + 1);
        placeholder = `ID-${n}`;
        tokenToPlaceholder.set(token, placeholder);
        idNumberToToken.set(n, token);
        count += 1;
      }
      return placeholder;
    });
  }

  text = text
    .replace(URL_RE, () => bump("[redacted-url]"))
    .replace(EMAIL_RE, () => bump("[redacted-email]"));

  // Word-bounded so a slug like `core` cannot corrupt `scoreboard`. Longest first.
  for (const literal of prepareLiterals(extraLiterals, 4)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(literal)}\\b`, "gi"), () => bump("[redacted]"));
  }

  text = text.replace(MENTION_RE, () => bump("[redacted-user]"));

  // Ticket keys are reversible: same key → same placeholder, restored in the response.
  const ticketNumberToKey = new Map<string, string>();
  const keyToPlaceholder = new Map<string, string>();
  text = text.replace(TICKET_RE, (key) => {
    if (NON_TICKET_PREFIXES.has(key.split("-")[0].toUpperCase())) {
      return key;
    }
    let placeholder = keyToPlaceholder.get(key);
    if (!placeholder) {
      const n = String(keyToPlaceholder.size + 1);
      placeholder = `TICKET-${n}`;
      keyToPlaceholder.set(key, placeholder);
      ticketNumberToKey.set(n, key);
      count += 1;
    }
    return placeholder;
  });

  const restore = (response: string): string =>
    response
      .replace(/TICKET-(\d+)/gi, (whole, n: string) => ticketNumberToKey.get(n) ?? whole)
      .replace(/ID-(\d+)/gi, (whole, n: string) => idNumberToToken.get(n) ?? whole);

  return { text, restore, redactedCount: count };
};
