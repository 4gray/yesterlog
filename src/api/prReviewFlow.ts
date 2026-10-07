import type { AppSettings } from "../../shared/types";
import {
  parseReviewFlow,
  REVIEW_FLOW_SYSTEM,
  reviewFlowPrompt,
  type ReviewFlowEvidence
} from "../domain/prReviewFlow";
import { aiConnectionFromSettings } from "./ollama";
import { nativeApi } from "./native";

/** Explicit user action only. The prompt contains an aggregate-only DTO for every provider. */
export async function analyzePrReviewFlow(settings: AppSettings, evidence: ReviewFlowEvidence) {
  if (!settings.aiEnabled || evidence.blocked) return undefined;
  const connection = aiConnectionFromSettings(settings);
  try {
    const result = await nativeApi.generateWithAi({
      provider: connection.provider ?? "ollama",
      endpoint: connection.endpoint,
      model: connection.model,
      cliPath: connection.cliPath,
      system: REVIEW_FLOW_SYSTEM,
      prompt: reviewFlowPrompt(evidence),
      format: "json"
    });
    return result.ok && result.response ? parseReviewFlow(result.response) : undefined;
  } catch {
    return undefined;
  }
}
