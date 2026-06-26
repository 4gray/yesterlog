import {
  buildEnhancePrompt,
  ENHANCE_SYSTEM_PROMPT,
  EMPTY_AI_DRAFTS,
  parseAiDrafts,
  type AiDrafts
} from "../domain/enhancePrompt";
import type { ReconstructDay } from "../domain/reconstruct";
import { nativeApi } from "./native";

/**
 * Renderer-side facade for the optional local-AI layer. Everything here is gated and
 * degrades gracefully: with no model, no Electron bridge, or any error, callers get the
 * deterministic reconstruction back unchanged. The deterministic core never depends on
 * this module.
 */

export interface OllamaStatus {
  reachable: boolean;
  models: string[];
  /** True when the configured model tag is among the pulled models. */
  modelReady: boolean;
  message?: string;
}

export interface OllamaConnection {
  endpoint: string;
  model: string;
}

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

/** Probes the endpoint and reports the activation-chain state for Settings. */
export const probeOllama = async (connection: OllamaConnection): Promise<OllamaStatus> => {
  const result = await nativeApi.listOllamaModels({ endpoint: connection.endpoint });
  return {
    reachable: result.ok,
    models: result.models,
    modelReady: result.ok && modelMatches(result.models, connection.model),
    message: result.message
  };
};

/**
 * Asks the local model to polish a day's signals into clean worklog prose and infer gaps.
 * Returns signal-keyed drafts; on disablement, unreachability, or any failure it returns
 * empty drafts so the deterministic reconstruction is preserved.
 */
export const computeAiDrafts = async (day: ReconstructDay, connection: OllamaConnection): Promise<AiDrafts> => {
  const hasEnhanceable =
    day.signals.some((signal) => !signal.isMarker && signal.durationMinutes > 0) ||
    day.rows.some((row) => row.kind === "empty");
  if (!hasEnhanceable) {
    return EMPTY_AI_DRAFTS;
  }

  try {
    const result = await nativeApi.generateWithOllama({
      endpoint: connection.endpoint,
      model: connection.model,
      system: ENHANCE_SYSTEM_PROMPT,
      prompt: buildEnhancePrompt(day),
      format: "json"
    });

    if (!result.ok || !result.response) {
      return EMPTY_AI_DRAFTS;
    }

    return parseAiDrafts(result.response);
  } catch {
    return EMPTY_AI_DRAFTS;
  }
};
