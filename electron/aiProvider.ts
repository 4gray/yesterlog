import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiListModelsRequest,
  AiListModelsResult
} from "../shared/types";
import { generateWithClaude, listClaudeModels } from "./claude";
import { generateWithCodex, listCodexModels } from "./codex";
import { generateWithOllama, listOllamaModels } from "./ollama";

/**
 * Provider dispatcher — the single main-process seam the renderer's `ai:generate` /
 * `ai:list-models` IPC channels call. It fans a provider-agnostic request out to the
 * on-device Ollama client or one of the CLI providers. Each underlying provider already
 * resolves (never rejects), so this stays a thin switch.
 */

export const generateWithAi = (request: AiGenerateRequest): Promise<AiGenerateResult> => {
  switch (request.provider) {
    case "claude-cli":
      return generateWithClaude(request);
    case "codex-cli":
      return generateWithCodex(request);
    case "ollama":
    default:
      return generateWithOllama({
        endpoint: request.endpoint ?? "",
        model: request.model ?? "",
        prompt: request.prompt,
        system: request.system,
        ...(request.format ? { format: request.format } : {})
      });
  }
};

export const listAiModels = (request: AiListModelsRequest): Promise<AiListModelsResult> => {
  switch (request.provider) {
    case "claude-cli":
      return listClaudeModels(request.cliPath);
    case "codex-cli":
      return listCodexModels(request.cliPath);
    case "ollama":
    default:
      return listOllamaModels({ endpoint: request.endpoint ?? "" });
  }
};
