import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../../shared/types";
import { aiModelLabel, polishRecap, probeOllama } from "../api/ollama";
import { useAiConnection } from "./useAiConnection";

export interface RecapPolishState {
  /** True only when AI is enabled AND the model is reachable + pulled. */
  aiOn: boolean;
  /** The polished prose overlay; undefined → show the deterministic list. */
  polished?: string;
  isPolishing: boolean;
  /** Run the on-device polish over the current recap text. */
  polish: () => void;
  /** Discard the prose overlay (back to the list). */
  reset: () => void;
  aiModel: string;
}

/**
 * Optional, on-device "Polish" for the standup recap — mirrors useReconstruct's
 * AI gating. Probes once per enable/connection change to decide whether to offer
 * the affordance, runs the polish on demand, and ALWAYS degrades to the
 * deterministic list (the prose is in-memory only — never persisted). The recap
 * text is the single input; whenever it changes (new day, in-week↔cross-week
 * swap) the prose is discarded so it never bleeds across days.
 */
export const useRecapPolish = (recapText: string, settings: AppSettings): RecapPolishState => {
  const [aiActive, setAiActive] = useState(false);
  const [polished, setPolished] = useState<string | undefined>();
  const [isPolishing, setIsPolishing] = useState(false);
  const runId = useRef(0);

  const aiConnection = useAiConnection(settings);

  // Probe once to gate the button — never per click.
  useEffect(() => {
    if (!settings.aiEnabled) {
      setAiActive(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await probeOllama(aiConnection);
        if (!cancelled) {
          setAiActive(status.reachable && status.modelReady);
        }
      } catch {
        if (!cancelled) {
          setAiActive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiConnection, settings.aiEnabled]);

  // Discard prose (and invalidate any in-flight run) whenever the recap changes.
  useEffect(() => {
    runId.current += 1;
    setPolished(undefined);
    setIsPolishing(false);
  }, [recapText]);

  const aiOn = settings.aiEnabled && aiActive;

  const polish = useCallback(() => {
    if (!aiOn || !recapText.trim()) {
      return;
    }
    const id = ++runId.current;
    setIsPolishing(true);
    void (async () => {
      try {
        const result = await polishRecap(recapText, aiConnection);
        if (runId.current !== id) {
          return;
        }
        // polishRecap returns the input unchanged on any failure; treat an
        // identical result as a silent fallback (stay on the list).
        setPolished(result.trim() && result.trim() !== recapText.trim() ? result : undefined);
      } finally {
        if (runId.current === id) {
          setIsPolishing(false);
        }
      }
    })();
  }, [aiConnection, aiOn, recapText]);

  const reset = useCallback(() => {
    runId.current += 1;
    setPolished(undefined);
    setIsPolishing(false);
  }, []);

  return { aiOn, polished, isPolishing, polish, reset, aiModel: aiModelLabel(settings) };
};
