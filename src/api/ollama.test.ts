import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiGenerateResult } from "../../shared/types";
import { polishRecap } from "./ollama";
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
