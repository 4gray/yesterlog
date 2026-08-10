// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScratchpadEditor } from "./ScratchpadEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("ScratchpadEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("imports existing Markdown into rich blocks and exposes the core toolbar", async () => {
    const onPlainTextChange = vi.fn();
    await act(async () => {
      root.render(
        <ScratchpadEditor
          initialText={"# Release notes\n\n- First item\n- Second item\n\nA **bold** detail."}
          onChange={vi.fn()}
          onPlainTextChange={onPlainTextChange}
          onBlur={vi.fn()}
        />
      );
    });
    await flush();

    expect(container.querySelector("h1")?.textContent).toBe("Release notes");
    expect(
      [...container.querySelectorAll("li")].map((item) => item.textContent)
    ).toEqual(["First item", "Second item"]);
    expect(container.querySelector(".notes-rich-bold")?.textContent).toBe("bold");
    expect(onPlainTextChange).toHaveBeenCalledWith(
      "Release notes\n\nFirst item\n\nSecond item\n\nA bold detail."
    );
    expect(
      container.querySelector('[contenteditable="true"][aria-label="General notes scratchpad"]')
    ).toBeTruthy();

    for (const label of [
      "Paragraph",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Bulleted list",
      "Numbered list"
    ]) {
      expect(container.querySelector(`button[aria-label="${label}"]`)).toBeTruthy();
    }
  });

  it("falls back to the portable Markdown text when rich state is not valid", async () => {
    await act(async () => {
      root.render(
        <ScratchpadEditor
          initialText="## Kept locally"
          initialEditorState="not-json"
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      );
    });
    await flush();

    expect(container.querySelector("h2")?.textContent).toBe("Kept locally");
  });
});
