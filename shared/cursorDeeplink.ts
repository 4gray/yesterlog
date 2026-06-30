/**
 * Builds the chat prompt that gets prefilled into Cursor, and the deeplink that
 * opens it. Shared between the renderer (which constructs the URL) and the
 * Electron main process (which validates it before handing off to
 * `shell.openExternal`).
 *
 * Cursor's prompt deeplink prefills the chat composer but never auto-runs the
 * agent — the user reviews and submits manually. See
 * https://cursor.com/docs/integrations/deeplinks
 */

export interface CursorPromptTicket {
  key: string;
  summary?: string;
  /** Plain text; Jira ADF is already flattened upstream via `adfToPlainText`. */
  description?: string;
  url?: string;
}

/** Cursor's documented prompt deeplink prefix. The encoded prompt follows. */
export const CURSOR_PROMPT_DEEPLINK_PREFIX = "cursor://anysphere.cursor-deeplink/prompt?text=";

/** Cursor caps deeplinks at 8000 characters after URL-encoding. */
export const CURSOR_DEEPLINK_MAX_LENGTH = 8000;

const TRUNCATION_MARKER = "\n\n…(ticket description truncated)";

/**
 * Frames the ticket as an implementation-ready prompt: a short instruction, the
 * `KEY — summary` heading, the description, and a link back to Jira. Missing
 * fields are skipped so the prompt never has dangling labels.
 */
export const buildCursorPrompt = (ticket: CursorPromptTicket): string => {
  const summary = ticket.summary?.trim();
  const heading = summary ? `${ticket.key} — ${summary}` : ticket.key;
  const blocks: string[] = ["Help me work on this Jira ticket.", heading];

  const description = ticket.description?.trim();
  if (description) {
    blocks.push(description);
  }

  const url = ticket.url?.trim();
  if (url) {
    blocks.push(`Jira: ${url}`);
  }

  return blocks.join("\n\n");
};

const encodedDeeplinkLength = (text: string): number =>
  CURSOR_PROMPT_DEEPLINK_PREFIX.length + encodeURIComponent(text).length;

/**
 * Wraps prompt text in Cursor's deeplink. If the encoded URL would exceed
 * Cursor's 8000-character limit, the tail is trimmed (binary search) and a
 * truncation marker appended so the URL always stays within budget.
 */
export const buildCursorDeeplink = (prompt: string): string => {
  if (encodedDeeplinkLength(prompt) <= CURSOR_DEEPLINK_MAX_LENGTH) {
    return CURSOR_PROMPT_DEEPLINK_PREFIX + encodeURIComponent(prompt);
  }

  // The marker costs ~50 chars once URL-encoded; the binary search below
  // includes it in every candidate, so the final URL always stays under the cap.
  // Slice by code point (not UTF-16 unit) so truncation never bisects an
  // emoji/surrogate pair, which would make encodeURIComponent throw.
  const codePoints = Array.from(prompt);

  // Largest prefix length whose `<prefix> + marker` still fits under the cap.
  let lo = 0;
  let hi = codePoints.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = codePoints.slice(0, mid).join("").trimEnd() + TRUNCATION_MARKER;
    if (encodedDeeplinkLength(candidate) <= CURSOR_DEEPLINK_MAX_LENGTH) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const text = codePoints.slice(0, lo).join("").trimEnd() + TRUNCATION_MARKER;
  return CURSOR_PROMPT_DEEPLINK_PREFIX + encodeURIComponent(text);
};

/** Convenience: ticket → prompt → deeplink. */
export const buildCursorPromptDeeplink = (ticket: CursorPromptTicket): string =>
  buildCursorDeeplink(buildCursorPrompt(ticket));

/**
 * Guards the main-process handler: only ever hand a real Cursor prompt deeplink
 * to the OS. The prefix check pins the scheme, host and path; the URL parse then
 * rejects anything that smuggles extra query params or a fragment after the
 * encoded prompt — a genuine deeplink carries only `text`.
 */
export const isCursorPromptDeeplink = (url: unknown): url is string => {
  if (typeof url !== "string" || !url.startsWith(CURSOR_PROMPT_DEEPLINK_PREFIX)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    return parsed.hash === "" && params.size === 1 && params.has("text");
  } catch {
    return false;
  }
};
