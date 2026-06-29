import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GITHUB_RAW_MAIN_URL } from "../../shared/releases";
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown";

describe("ReleaseNotesMarkdown", () => {
  it("renders markdown release notes without raw HTML injection", () => {
    const markup = renderToStaticMarkup(
      <ReleaseNotesMarkdown
        markdown={[
          "## Added",
          "",
          "- Render **markdown** notes.",
          "- Keep `screenshots` tidy.",
          "",
          "![Week screenshot](screenshots/v1.4.0/dark-week.png)",
          "",
          "[Release](https://github.com/4gray/time-bro/releases/tag/v1.4.0)",
          "[Unsafe](javascript:alert(1))",
          "<script>alert(1)</script>"
        ].join("\n")}
      />
    );

    expect(markup).toContain("<h2>Added</h2>");
    expect(markup).toContain("<strong>markdown</strong>");
    expect(markup).toContain("<code>screenshots</code>");
    expect(markup).toContain(`${GITHUB_RAW_MAIN_URL}screenshots/v1.4.0/dark-week.png`);
    expect(markup).toContain('class="release-notes-image"');
    expect(markup).toContain('href="https://github.com/4gray/time-bro/releases/tag/v1.4.0"');
    expect(markup).not.toContain("javascript:alert");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
