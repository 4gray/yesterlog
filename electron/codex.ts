import type { AiGenerateRequest, AiGenerateResult, AiListModelsResult } from "../shared/types";
import { resolveCliEnv, resolveCliPath, runCli } from "./cli";

/**
 * Codex CLI provider — shells out to `codex exec` (non-interactive mode) in the Electron
 * **main** process. NOT on-device: the prompt goes to OpenAI's cloud under the user's Codex
 * auth. `codex exec` streams progress to stderr and writes only the final agent message to
 * stdout, so we capture stdout as the completion. We run `--sandbox read-only` so a pure
 * text-generation call can never mutate the filesystem, and `--skip-git-repo-check` so it
 * runs from the neutral temp cwd. Resolves (never rejects) for graceful degradation.
 */

const DEFAULT_COMMAND = "codex";
const GENERATE_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 8_000;

const notFoundMessage = (command: string): string =>
  `Could not find the Codex CLI (\`${command}\`). Install it, or set an absolute path in Settings.`;

/** Codex has no system-prompt flag, so fold the system text into the prompt. */
export const combineCodexPrompt = (prompt: string, system?: string): string => {
  const trimmedSystem = system?.trim();
  return trimmedSystem ? `${trimmedSystem}\n\n${prompt}` : prompt;
};

/**
 * Build the full argv for a one-shot `codex exec` call. The combined prompt is the final
 * positional argument. `read-only` sandbox + `--skip-git-repo-check` keep it side-effect free.
 */
export const buildCodexArgs = (request: Pick<AiGenerateRequest, "model">, fullPrompt: string): string[] => {
  const args = ["exec", "--skip-git-repo-check", "--sandbox", "read-only"];
  const model = request.model?.trim();
  if (model) {
    args.push("-m", model);
  }
  args.push(fullPrompt);
  return args;
};

export const parseCodexResult = (
  stdout: string,
  stderr: string,
  code: number | null,
  timedOut: boolean
): AiGenerateResult => {
  const trimmedOut = stdout.trim();
  if (code === 0 && trimmedOut) {
    return { ok: true, response: trimmedOut };
  }
  if (timedOut) {
    return { ok: false, message: "Codex CLI did not respond in time." };
  }
  // A non-zero exit still sometimes prints a usable message to stdout; prefer stderr detail.
  const detail = stderr.trim().split("\n").filter(Boolean).pop();
  if (!trimmedOut && !detail) {
    return { ok: false, message: `Codex CLI exited with code ${code ?? "unknown"}.` };
  }
  if (code === 0) {
    return { ok: false, message: "Codex CLI returned an empty completion." };
  }
  return { ok: false, message: detail || `Codex CLI exited with code ${code ?? "unknown"}.` };
};

export const generateWithCodex = async (request: AiGenerateRequest): Promise<AiGenerateResult> => {
  const command = request.cliPath?.trim() || DEFAULT_COMMAND;
  const binary = await resolveCliPath(command);
  if (!binary) {
    return { ok: false, message: notFoundMessage(command) };
  }

  const env = await resolveCliEnv();
  const fullPrompt = combineCodexPrompt(request.prompt, request.system);
  const result = await runCli(binary, buildCodexArgs(request, fullPrompt), {
    timeoutMs: GENERATE_TIMEOUT_MS,
    env
  });

  if (result.spawnError) {
    return { ok: false, message: `Could not run the Codex CLI: ${result.spawnError.message}` };
  }
  return parseCodexResult(result.stdout, result.stderr, result.code, result.timedOut);
};

/**
 * Availability probe for Settings — confirms the binary runs via `codex --version`. Codex
 * has no model-list command and models are free-text, so `models` is always empty.
 */
export const listCodexModels = async (cliPath?: string): Promise<AiListModelsResult> => {
  const command = cliPath?.trim() || DEFAULT_COMMAND;
  const binary = await resolveCliPath(command);
  if (!binary) {
    return { ok: false, models: [], message: notFoundMessage(command) };
  }

  const env = await resolveCliEnv();
  const result = await runCli(binary, ["--version"], { input: "", timeoutMs: VERSION_TIMEOUT_MS, env });
  if (result.spawnError) {
    return { ok: false, models: [], message: `Could not run the Codex CLI: ${result.spawnError.message}` };
  }
  if (result.timedOut) {
    return { ok: false, models: [], message: "Codex CLI did not respond in time." };
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n").filter(Boolean).pop();
    return { ok: false, models: [], message: detail || `Codex CLI exited with code ${result.code ?? "unknown"}.` };
  }
  return { ok: true, models: [], message: result.stdout.trim() || "Codex CLI is ready." };
};
