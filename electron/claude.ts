import type { AiGenerateRequest, AiGenerateResult, AiListModelsResult } from "../shared/types";
import { resolveCliEnv, resolveCliPath, runCli } from "./cli";

/**
 * Claude CLI provider — shells out to `claude -p` (print mode) in the Electron **main**
 * process. Unlike Ollama this is NOT on-device: the prompt goes to Anthropic's cloud under
 * the user's existing Claude auth (subscription or API key). Like every AI path here it
 * resolves (never rejects): on any failure it returns `{ ok: false, message }` so the caller
 * falls back to the deterministic reconstruction.
 */

const DEFAULT_COMMAND = "claude";
const GENERATE_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 8_000;

const notFoundMessage = (command: string): string =>
  `Could not find the Claude CLI (\`${command}\`). Install it, or set an absolute path in Settings.`;

/**
 * Build the argv for a one-shot `claude -p` call. The prompt is fed via stdin (not argv),
 * so `--tools` — a variadic flag — stays last with nothing to greedily consume after it.
 * `--system-prompt` replaces Claude Code's default system prompt, which both applies our
 * instructions and trims the (billable) default context; `--tools ""` disables every tool
 * so a text-generation call can never touch the filesystem.
 */
export const buildClaudeArgs = (request: Pick<AiGenerateRequest, "model" | "system">): string[] => {
  const args = ["-p", "--output-format", "json"];
  const model = request.model?.trim();
  if (model) {
    args.push("--model", model);
  }
  const system = request.system?.trim();
  if (system) {
    args.push("--system-prompt", system);
  }
  args.push("--tools", "");
  return args;
};

interface ClaudePrintResult {
  is_error?: boolean;
  result?: string;
  subtype?: string;
}

/**
 * Turn a finished `claude -p --output-format json` invocation into an AiGenerateResult.
 * The stdout wrapper carries the model's text in `.result`; if the wrapper can't be parsed
 * we defensively treat non-empty stdout as the response before giving up with an error.
 */
export const parseClaudeResult = (
  stdout: string,
  stderr: string,
  code: number | null,
  timedOut: boolean
): AiGenerateResult => {
  const trimmedOut = stdout.trim();
  if (trimmedOut) {
    try {
      const parsed = JSON.parse(trimmedOut) as ClaudePrintResult;
      if (parsed && typeof parsed === "object" && "result" in parsed) {
        if (parsed.is_error) {
          return { ok: false, message: parsed.result?.trim() || `Claude reported an error (${parsed.subtype ?? "error"}).` };
        }
        const text = parsed.result?.trim();
        return text ? { ok: true, response: text } : { ok: false, message: "Claude returned an empty completion." };
      }
    } catch {
      // Not the JSON wrapper.
    }
    // Non-wrapper stdout is only trustworthy on a clean exit; a banner or partial output
    // from a failed or timed-out run must not be reported as a successful completion.
    if (code === 0 && !timedOut) {
      return { ok: true, response: trimmedOut };
    }
  }

  if (timedOut) {
    return { ok: false, message: "Claude CLI did not respond in time." };
  }
  const detail = stderr.trim().split("\n").filter(Boolean).pop();
  return { ok: false, message: detail || `Claude CLI exited with code ${code ?? "unknown"}.` };
};

export const generateWithClaude = async (request: AiGenerateRequest): Promise<AiGenerateResult> => {
  const command = request.cliPath?.trim() || DEFAULT_COMMAND;
  const binary = await resolveCliPath(command);
  if (!binary) {
    return { ok: false, message: notFoundMessage(command) };
  }

  const env = await resolveCliEnv();
  const result = await runCli(binary, buildClaudeArgs(request), {
    input: request.prompt,
    timeoutMs: GENERATE_TIMEOUT_MS,
    env
  });

  if (result.spawnError) {
    return { ok: false, message: `Could not run the Claude CLI: ${result.spawnError.message}` };
  }
  return parseClaudeResult(result.stdout, result.stderr, result.code, result.timedOut);
};

/**
 * Availability probe for Settings. There is no CLI equivalent of Ollama's model list, so we
 * confirm the binary runs via `claude --version` and surface the version in `message`.
 * Models are entered as free-text aliases, so `models` is always empty.
 */
export const listClaudeModels = async (cliPath?: string): Promise<AiListModelsResult> => {
  const command = cliPath?.trim() || DEFAULT_COMMAND;
  const binary = await resolveCliPath(command);
  if (!binary) {
    return { ok: false, models: [], message: notFoundMessage(command) };
  }

  const env = await resolveCliEnv();
  const result = await runCli(binary, ["--version"], { input: "", timeoutMs: VERSION_TIMEOUT_MS, env });
  if (result.spawnError) {
    return { ok: false, models: [], message: `Could not run the Claude CLI: ${result.spawnError.message}` };
  }
  if (result.timedOut) {
    return { ok: false, models: [], message: "Claude CLI did not respond in time." };
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n").filter(Boolean).pop();
    return { ok: false, models: [], message: detail || `Claude CLI exited with code ${result.code ?? "unknown"}.` };
  }
  return { ok: true, models: [], message: result.stdout.trim() || "Claude CLI is ready." };
};
