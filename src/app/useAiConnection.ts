import { useMemo } from "react";
import type { AppSettings } from "../../shared/types";
import { aiConnectionFromSettings, type AiConnection } from "../api/ollama";

/**
 * Memoized active-provider connection, shared by the Reconstruct and recap hooks.
 *
 * The dependency list must cover EVERY settings field `aiConnectionFromSettings` reads —
 * the provider config AND the identifiers that feed cloud redaction (`collectRedactLiterals`:
 * workspace, repositories, emails, Jira site). Omitting the redaction fields would let a
 * mid-session settings change leave the cloud redaction using stale company/user identifiers.
 */
export const useAiConnection = (settings: AppSettings): AiConnection =>
  useMemo(
    () => aiConnectionFromSettings(settings),
    [
      settings.aiProvider,
      settings.ollamaEndpoint,
      settings.ollamaModel,
      settings.claudeCliPath,
      settings.claudeModel,
      settings.codexCliPath,
      settings.codexModel,
      settings.bitbucketWorkspace,
      settings.bitbucketRepositories,
      settings.jiraEmail,
      settings.bitbucketEmail,
      settings.jiraBaseUrl
    ]
  );
