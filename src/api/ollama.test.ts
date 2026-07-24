import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiGenerateResult } from "../../shared/types";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "../domain/recapWorkspace";
import { computeNotesBriefing, enhanceRecapWorkspace, polishRecap } from "./ollama";
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

describe("computeNotesBriefing", () => {
  const briefingInput = {
    ticket: {
      key: "ABC-1",
      summary: "Move sessions to Redis",
      description: "Keep the fallback path.",
      comments: ["Confirm rollback behavior."]
    },
    pullRequest: {
      id: 42,
      title: "ABC-1 Redis session store",
      diffstatSummary: "3 files changed, +51 -12."
    }
  };

  it("requests strict JSON from the configured provider and parses suggestions", async () => {
    const generate = vi.spyOn(nativeApi, "generateWithAi").mockResolvedValue({
      ok: true,
      response: JSON.stringify({
        suggestions: [
          { kind: "risk", text: "The fallback may mask connection failures." },
          { kind: "check", text: "Verify rollback metrics." }
        ]
      })
    });

    await expect(computeNotesBriefing(briefingInput, connection)).resolves.toEqual([
      {
        id: "briefing-1",
        kind: "risk",
        text: "The fallback may mask connection failures."
      },
      {
        id: "briefing-2",
        kind: "check",
        text: "Verify rollback metrics."
      }
    ]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        endpoint: connection.endpoint,
        model: connection.model,
        format: "json",
        prompt: expect.stringContaining('"key":"ABC-1"'),
        system: expect.stringContaining("cautious engineering briefing assistant")
      })
    );
  });

  it("redacts cloud prompts and restores reversible ticket keys in suggestions", async () => {
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return {
        ok: true,
        response: JSON.stringify({
          suggestions: [{ kind: "question", text: "Does TICKET-1 cover rollback?" }]
        })
      };
    });

    const result = await computeNotesBriefing(briefingInput, {
      provider: "claude-cli",
      endpoint: "",
      model: "sonnet",
      cliPath: "claude",
      redactLiterals: []
    });

    expect(sentPrompt).not.toContain("ABC-1");
    expect(sentPrompt).toContain("TICKET-1");
    expect(result[0]?.text).toBe("Does ABC-1 cover rollback?");
  });

  it("degrades to an empty briefing on provider, transport, or parse failure", async () => {
    mockGenerate(async () => ({ ok: false, message: "offline" }));
    await expect(computeNotesBriefing(briefingInput, connection)).resolves.toEqual([]);

    vi.restoreAllMocks();
    mockGenerate(async () => ({ ok: true, response: "not json" }));
    await expect(computeNotesBriefing(briefingInput, connection)).resolves.toEqual([]);

    vi.restoreAllMocks();
    mockGenerate(async () => {
      throw new Error("no bridge");
    });
    await expect(computeNotesBriefing(briefingInput, connection)).resolves.toEqual([]);
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

const workspaceResponse = (_draft: ReturnType<typeof workspaceDraft>, sourceRef: string) => JSON.stringify({
  format: "perf",
  document: {
    lead: "Grounded update.",
    paragraphs: [{ id: "perf-paragraph", text: "The available history records grounded work from the cited evidence.", refs: [sourceRef] }]
  }
});

describe("enhanceRecapWorkspace", () => {
  it("uses the configured cloud provider, redacts reversible source ids, and restores valid output", async () => {
    const draft = workspaceDraft();
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return { ok: true, response: workspaceResponse(draft, "ID-1") };
    });

    const result = await enhanceRecapWorkspace(draft, {
      provider: "claude-cli", endpoint: "", model: "sonnet", cliPath: "claude", redactLiterals: []
    }, "perf", "detailed");

    expect(sentPrompt).not.toContain("note:fact");
    expect(sentPrompt).toContain("ID-1");
    expect(result.generator).toBe("ai");
    expect(result.aiFormats).toContain("perf");
    expect(result.narratives?.perf?.paragraphs?.[0].refs).toEqual(["note:fact"]);
  });

  it("restores repository-qualified refs after cloud redaction", async () => {
    const draft = workspaceDraft();
    const source = draft.sources[0];
    const oldSourceId = source.id;
    source.id = "pr:workspace:repo-a:42";
    source.kind = "pull-request";
    source.repository = "repo-a";
    source.pullRequestId = 42;
    draft.themes[0].id = draft.themes[0].id.replace(oldSourceId, source.id);
    draft.themes[0].sourceIds = [source.id];
    for (const copy of Object.values(draft.themes[0].copy)) {
      for (const paragraph of copy.paragraphs ?? []) paragraph.refs = ["repo-a#42"];
      for (const line of copy.lines) line.refs = ["repo-a#42"];
    }
    for (const paragraph of draft.narratives?.perf?.paragraphs ?? []) paragraph.refs = ["repo-a#42"];
    let sentPrompt = "";
    vi.spyOn(nativeApi, "generateWithAi").mockImplementation(async (request) => {
      sentPrompt = request.prompt;
      return {
        ok: true,
        response: workspaceResponse(draft, "ID-2")
      };
    });

    const result = await enhanceRecapWorkspace(draft, {
      provider: "codex-cli", endpoint: "", model: "", cliPath: "codex", redactLiterals: ["repo-a"]
    }, "perf", "detailed");

    expect(sentPrompt).not.toContain("repo-a");
    expect(sentPrompt).toContain('"ref":"ID-2"');
    expect(result.generator).toBe("ai");
    expect(result.narratives?.perf?.paragraphs?.[0].refs).toEqual(["repo-a#42"]);
  });

  it("keeps the deterministic draft when the provider fails or returns invalid copy", async () => {
    const draft = workspaceDraft();
    mockGenerate(async () => ({ ok: false, message: "offline" }));
    expect(await enhanceRecapWorkspace(draft, connection, "perf", "detailed")).toBe(draft);
    vi.restoreAllMocks();
    mockGenerate(async () => ({ ok: true, response: "{}" }));
    expect(await enhanceRecapWorkspace(draft, connection, "perf", "detailed")).toBe(draft);
  });
});
