import type { AiProvider, AppSettings, RecapDraftVersion } from "../../shared/types";
import {
  buildEnhancePrompt,
  ENHANCE_SYSTEM_PROMPT,
  EMPTY_AI_DRAFTS,
  parseAiDrafts,
  type AiDrafts
} from "../domain/enhancePrompt";
import { RECAP_POLISH_SYSTEM_PROMPT, buildRecapPolishPrompt } from "../domain/recapPolishPrompt";
import { redactForCloud } from "../domain/redaction";
import {
  buildRecapWorkspacePrompt,
  parseRecapWorkspaceDraft,
  RECAP_WORKSPACE_SYSTEM_PROMPT
} from "../domain/recapWorkspacePrompt";
import type { ReconstructDay } from "../domain/reconstruct";
import { nativeApi } from "./native";

/**
 * Renderer-side facade for the optional AI layer. Everything here is gated and degrades
 * gracefully: with no model, no Electron bridge, or any error, callers get the deterministic
 * reconstruction back unchanged. The deterministic core never depends on this module.
 *
 * The facade is provider-agnostic — it forwards a {@link AiConnection} (chosen provider +
 * its settings) to the main process, which dispatches to on-device Ollama or a CLI provider.
 * (The module is still named `ollama` for historical reasons; the exported names are generic.)
 */

export interface OllamaStatus {
  reachable: boolean;
  models: string[];
  /** True when the provider is reachable AND has a usable model configured. */
  modelReady: boolean;
  message?: string;
}
export type AiStatus = OllamaStatus;

export interface AiConnection {
  /** Defaults to `ollama` when omitted (older settings). */
  provider?: AiProvider;
  /** Ollama endpoint (unused by the CLI providers). */
  endpoint: string;
  /** Ollama tag, Claude alias, or Codex model name. */
  model: string;
  /** CLI command/path override for the Claude/Codex providers. */
  cliPath?: string;
  /** Company/user identifiers to scrub before sending to a cloud provider. */
  redactLiterals?: string[];
}
/** @deprecated Use {@link AiConnection}. Kept so existing imports keep resolving. */
export type OllamaConnection = AiConnection;

/** Cloud providers send data off the machine, so their prompts are redacted first. */
const isCloudProvider = (provider: AiProvider): boolean =>
  provider === "claude-cli" || provider === "codex-cli";

/** The company subdomain from a Jira site URL (`https://acme.atlassian.net` → `acme`). */
const jiraCompanyToken = (jiraBaseUrl: string): string | undefined => {
  const host = jiraBaseUrl.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const sub = host.split(".")[0];
  return sub || undefined;
};

/** Known, company/user-identifying literals to scrub from cloud prompts (best-effort). */
const collectRedactLiterals = (settings: AppSettings): string[] => {
  const literals: string[] = [];
  const push = (value: string | undefined) => {
    if (value && value.trim()) {
      literals.push(value.trim());
    }
  };
  push(settings.bitbucketWorkspace);
  for (const slug of (settings.bitbucketRepositories ?? "").split(",")) {
    push(slug);
  }
  push(settings.jiraEmail);
  push(settings.bitbucketEmail);
  push(jiraCompanyToken(settings.jiraBaseUrl ?? ""));
  return literals;
};

/** Build the active-provider connection from settings, applying per-provider defaults. */
export const aiConnectionFromSettings = (settings: AppSettings): AiConnection => {
  const provider = settings.aiProvider ?? "ollama";
  if (provider === "claude-cli") {
    return {
      provider,
      endpoint: "",
      model: settings.claudeModel ?? "sonnet",
      cliPath: settings.claudeCliPath ?? "claude",
      redactLiterals: collectRedactLiterals(settings)
    };
  }
  if (provider === "codex-cli") {
    return {
      provider,
      endpoint: "",
      model: settings.codexModel ?? "",
      cliPath: settings.codexCliPath ?? "codex",
      redactLiterals: collectRedactLiterals(settings)
    };
  }
  return { provider: "ollama", endpoint: settings.ollamaEndpoint, model: settings.ollamaModel };
};

/** A short label for the active model, for status chips (Codex may run with no explicit model). */
export const aiModelLabel = (settings: AppSettings): string => {
  const provider = settings.aiProvider ?? "ollama";
  const model =
    provider === "claude-cli"
      ? settings.claudeModel ?? "sonnet"
      : provider === "codex-cli"
        ? settings.codexModel ?? ""
        : settings.ollamaModel;
  if (model.trim()) {
    return model.trim();
  }
  return provider === "codex-cli" ? "codex default" : "";
};

const modelMatches = (models: string[], model: string): boolean => {
  const wanted = model.trim().toLowerCase();
  if (!wanted) {
    return false;
  }
  return models.some((available) => {
    const tag = available.trim().toLowerCase();
    // accept "llama3.1" matching "llama3.1:8b" (and vice-versa)
    return tag === wanted || tag.split(":")[0] === wanted.split(":")[0];
  });
};

/** Probes the active provider and reports the activation-chain state for Settings. */
export const probeOllama = async (connection: AiConnection): Promise<OllamaStatus> => {
  const provider = connection.provider ?? "ollama";
  const result = await nativeApi.listAiModels({
    provider,
    endpoint: connection.endpoint,
    cliPath: connection.cliPath
  });

  if (provider === "ollama") {
    return {
      reachable: result.ok,
      models: result.models,
      modelReady: result.ok && modelMatches(result.models, connection.model),
      message: result.message
    };
  }

  // CLI providers: "reachable" means the binary runs. Models are free-text, so a provider is
  // "ready" once reachable and (for Claude) a model alias is set; Codex may run with no model.
  const hasModel = provider === "codex-cli" || connection.model.trim().length > 0;
  return {
    reachable: result.ok,
    models: result.models,
    modelReady: result.ok && hasModel,
    message: result.message
  };
};
/** @deprecated Use {@link probeOllama} (provider-agnostic despite the name). */
export const probeAiProvider = probeOllama;

/**
 * Asks the active provider to polish a day's signals into clean worklog prose and infer gaps.
 * Returns signal-keyed drafts; on disablement, unreachability, or any failure it returns
 * empty drafts so the deterministic reconstruction is preserved.
 */
export const computeAiDrafts = async (day: ReconstructDay, connection: AiConnection): Promise<AiDrafts> => {
  const hasEnhanceable =
    day.signals.some((signal) => !signal.isMarker && signal.durationMinutes > 0) ||
    day.rows.some((row) => row.kind === "empty");
  if (!hasEnhanceable) {
    return EMPTY_AI_DRAFTS;
  }

  const provider = connection.provider ?? "ollama";
  // On-device Ollama sends nothing off the machine; cloud providers get a redacted prompt.
  // Signal ids are passed as reversible tokens because Bitbucket ids embed workspace/repo/PR.
  const redaction = isCloudProvider(provider)
    ? redactForCloud(
        buildEnhancePrompt(day),
        connection.redactLiterals,
        day.signals.map((signal) => signal.id)
      )
    : undefined;

  try {
    const result = await nativeApi.generateWithAi({
      provider,
      endpoint: connection.endpoint,
      model: connection.model,
      cliPath: connection.cliPath,
      system: ENHANCE_SYSTEM_PROMPT,
      prompt: redaction ? redaction.text : buildEnhancePrompt(day),
      format: "json"
    });

    if (!result.ok || !result.response) {
      return EMPTY_AI_DRAFTS;
    }

    return parseAiDrafts(redaction ? redaction.restore(result.response) : result.response);
  } catch {
    return EMPTY_AI_DRAFTS;
  }
};

/**
 * Rewrites the deterministic recap text into 2–3 spoken sentences via the active provider.
 * Every failure path — empty input, no bridge, `ok:false`, empty response, or a throw —
 * returns the original `recapText` unchanged, so the caller always has the deterministic list.
 */
export const polishRecap = async (recapText: string, connection: AiConnection): Promise<string> => {
  if (!recapText.trim()) {
    return recapText;
  }
  const provider = connection.provider ?? "ollama";
  const redaction = isCloudProvider(provider)
    ? redactForCloud(buildRecapPolishPrompt(recapText), connection.redactLiterals)
    : undefined;

  try {
    const result = await nativeApi.generateWithAi({
      provider,
      endpoint: connection.endpoint,
      model: connection.model,
      cliPath: connection.cliPath,
      system: RECAP_POLISH_SYSTEM_PROMPT,
      prompt: redaction ? redaction.text : buildRecapPolishPrompt(recapText)
      // No `format` — we want prose, not JSON.
    });
    if (!result.ok || !result.response) {
      return recapText;
    }
    const response = redaction ? redaction.restore(result.response) : result.response;
    return response.trim() || recapText;
  } catch {
    return recapText;
  }
};

export const enhanceRecapWorkspace = async (
  draft: RecapDraftVersion,
  connection: AiConnection
): Promise<RecapDraftVersion> => {
  const provider = connection.provider ?? "ollama";
  const prompt = buildRecapWorkspacePrompt(draft);
  const redaction = isCloudProvider(provider)
    ? redactForCloud(prompt, connection.redactLiterals, draft.sources.map((source) => source.id))
    : undefined;
  try {
    const result = await nativeApi.generateWithAi({
      provider,
      endpoint: connection.endpoint,
      model: connection.model,
      cliPath: connection.cliPath,
      system: RECAP_WORKSPACE_SYSTEM_PROMPT,
      prompt: redaction ? redaction.text : prompt,
      format: "json"
    });
    if (!result.ok || !result.response) return draft;
    const response = redaction ? redaction.restore(result.response) : result.response;
    return parseRecapWorkspaceDraft(response, draft) ?? draft;
  } catch {
    return draft;
  }
};
