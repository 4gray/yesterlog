import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiGenerateResult } from "../../shared/types";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "../domain/recapWorkspace";
import { enhanceRecapWorkspace, polishRecap } from "./ollama";
import { nativeApi } from "./native";

const connection = { provider: "ollama" as const, endpoint: "http://localhost:11434", model: "llama3.1:8b" };
const recap = "Yesterday (Fri Jun 19) — 2h tracked.\n\nTickets (2h):\n• ABC-1 Thing — 2h";

const mockGenerate = (impl: () => Promise<AiGenerateResult>) =>
  vi.spyOn(nativeApi, "generateWithAi").mockImplementation(impl);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("polishRecap", () => {
  it("returns the trimmed model prose on success", async () => {
    mockGenerate(async () => ({ ok: true, response: "  I shipped ABC-1 yesterday.  " }));
    expect(await polishRecap(recap, connection)).toBe("I shipped ABC-1 yesterday.");
  });

  it("degrades to the deterministic text when the call fails", async () => {
    mockGenerate(async () => ({ ok: false, message: "offline" }));
    expect(await polishRecap(recap, connection)).toBe(recap);
  });

  it("degrades when the response is empty", async () => {
    mockGenerate(async () => ({ ok: true, response: "" }));
    expect(await polishRecap(recap, connection)).toBe(recap);
  });

  it("degrades when the bridge throws", async () => {
    mockGenerate(async () => {
      throw new Error("no bridge");
    });
    expect(await polishRecap(recap, connection)).toBe(recap);
  });

  it("never calls the model for empty input", async () => {
    const generate = mockGenerate(async () => ({ ok: true, response: "x" }));
    expect(await polishRecap("   ", connection)).toBe("   ");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("polishRecap redaction", () => {
  const recapWithKey = "Yesterday (Fri Jun 19) — 2h.\n\nTickets (2h):\n• ABC-1 Thing — 2h";

  it("redacts ticket keys for a cloud provider and restores them in the prose", async () => {
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return { ok: true, response: "I shipped TICKET-1 yesterday." };
    });

    const result = await polishRecap(recapWithKey, {
      provider: "claude-cli",
      endpoint: "",
      model: "sonnet",
      cliPath: "claude"
    });

    expect(sentPrompt).not.toContain("ABC-1");
    expect(sentPrompt).toContain("TICKET-1");
    expect(result).toBe("I shipped ABC-1 yesterday.");
  });

  it("does not redact for the on-device Ollama provider", async () => {
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return { ok: true, response: "prose" };
    });

    await polishRecap(recapWithKey, { provider: "ollama", endpoint: "http://localhost:11434", model: "llama3.1:8b" });
    expect(sentPrompt).toContain("ABC-1");
  });
});

const workspaceDraft = () => {
  const input: RecapEvidenceInput = {
    interval: recapIntervalForDate("week", new Date(2026, 5, 17)),
    syncResults: [], reviewResults: [], activityResults: [], recurringEntries: [], reconstructDrafts: {},
    personalNotes: [{
      id: "fact", weekKey: "2026-06-15", dateKey: "2026-06-17", title: "Design review",
      text: "Reviewed the flow", timeSpentSeconds: 3600, startedISO: "2026-06-17T10:00:00Z",
      createdAt: "2026-06-17T10:00:00Z", updatedAt: "2026-06-17T10:00:00Z"
    }]
  };
  return buildDeterministicRecap(input);
};

const workspaceResponse = (draft: ReturnType<typeof workspaceDraft>, sourceRef: string, themeId = draft.themes[0].id) => JSON.stringify({
  themes: [{
    id: themeId,
    name: "Design review",
    copy: Object.fromEntries((["perf", "manager", "cv", "standup", "changelog"] as const).map((format) => [format, {
      lead: "Grounded update.",
      version: format === "changelog" ? "Grounded release." : undefined,
      lines: [{ id: `${format}-line`, short: "Completed grounded work.", long: "Completed grounded work from the cited evidence.", refs: [sourceRef], tag: format === "changelog" ? "Added" : undefined }]
    }]))
  }]
});

describe("enhanceRecapWorkspace", () => {
  it("uses the configured cloud provider, redacts reversible source ids, and restores valid output", async () => {
    const draft = workspaceDraft();
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return { ok: true, response: workspaceResponse(draft, "ID-1", draft.themes[0].id.replace("note:fact", "ID-1")) };
    });

    const result = await enhanceRecapWorkspace(draft, {
      provider: "claude-cli", endpoint: "", model: "sonnet", cliPath: "claude", redactLiterals: []
    });

    expect(sentPrompt).not.toContain("note:fact");
    expect(sentPrompt).toContain("ID-1");
    expect(result.generator).toBe("ai");
    expect(result.themes[0].copy.perf.lines[0].refs).toEqual(["note:fact"]);
  });

  it("keeps the deterministic draft when the provider fails or returns invalid copy", async () => {
    const draft = workspaceDraft();
    mockGenerate(async () => ({ ok: false, message: "offline" }));
    expect(await enhanceRecapWorkspace(draft, connection)).toBe(draft);
    vi.restoreAllMocks();
    mockGenerate(async () => ({ ok: true, response: "{}" }));
    expect(await enhanceRecapWorkspace(draft, connection)).toBe(draft);
  });
});
