# Release Notes Markdown And History

## Goal

Improve in-app release notes so GitHub markdown renders cleanly, screenshots stay readable at their natural size, Settings can open notes for the current version, and the dialog can browse published releases from the GitHub API.

## Decisions

- Keep GitHub API calls in the Electron main process and expose release history through IPC.
- Reuse the existing update/release notes flow instead of adding a second UI surface.
- Render a safe markdown subset in React without raw HTML injection.
- Treat GitHub-hosted release images as bounded content: preserve natural aspect ratio, avoid upscaling, and cap width to the dialog.
- Use the current app version when Settings opens release notes and load/browse release history inside the dialog.

## Work Items

- Add shared release-history types and GitHub release-list helpers. Done.
- Add Electron/preload/native IPC for fetching published releases. Done.
- Extend `useReleaseUpdates` to load current-version notes and history. Done.
- Replace the plain `<pre>` release notes view with markdown rendering and release navigation. Done.
- Update Settings actions and tests. Done.

## Verification

- `npm install` completed and reported 0 vulnerabilities.
- `npm run test` passes: 85 files, 440 tests.
- `npm run build` passes.
- `npm run e2e:renderer` passes: 5 renderer smoke tests.
- Browser QA with Browser plugin at `http://127.0.0.1:5173/?demo=1&view=settings&theme=dark&seed=release&today=2026-06-17&update=available`:
  - Desktop default viewport: Settings/About shows Current notes, release dialog opens on current `v1.0.0`, version rail switches to `v1.3.0`, markdown heading/bold text render, screenshot image resolves through the raw GitHub URL, image stays within the notes column, no document horizontal overflow, and console warn/error logs are empty.
  - Mobile `390x844`: version rail stacks horizontally, markdown screenshot stays within the notes column, footer actions remain visible inside the modal, no document horizontal overflow, and console warn/error logs are empty.
