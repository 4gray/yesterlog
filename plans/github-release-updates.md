# GitHub Release Update Notices

## Goal

Add a lightweight, cross-platform update checker that shows the current app version, the latest GitHub release version, release notes, platform-specific download links, and a persistent snackbar when a newer release is available.

## Decisions

- Use Electron main-process IPC for app metadata, GitHub release fetching, and opening external release URLs.
- Use `app.getVersion()` for the installed/current version instead of reading `package.json` in the renderer.
- Query GitHub Releases for `4gray/time-bro` and treat the release tag/name as the latest version.
- Keep this as a manual download/open-release flow rather than a packaged auto-updater.
- Reuse the existing snackbar layer with an optional action button for the release link.
- Read release notes from the public GitHub Releases API and render them in an in-app dialog.
- Choose a direct download asset by platform in the Electron main process: Linux `.deb`, macOS arm `.dmg`, Windows `.exe`.
- Cache successful automatic update checks for 6 hours so repeated app starts do not trip GitHub abuse/rate protection; manual checks still force a fresh request.
- Include the new Month view in the release screenshot workflow.

## Pending Work

- None.

## Verification

- `npm run test` passes.
- `npm run build` passes.
- `npm run release:dry-run` passes for `v1.3.0`.
- `npm run screenshots:release` captured 12 screenshots in `screenshots/v1.3.0`, including `dark-month.png` and `light-month.png`.
- Browser QA with Browser plugin at `http://127.0.0.1:5174/?demo=1&view=settings&theme=dark&seed=release&today=2026-06-17&update=available`:
  - Desktop `1280x720`: About settings renders, Check updates shows the update snackbar with Release notes and Download actions, Release notes opens the dialog, snackbar remains visible, release notes body renders, no horizontal overflow, and console warn/error logs are empty.
  - Mobile `390x844`: Same flow works, modal and snackbar fit within the viewport, no horizontal overflow, and console warn/error logs are empty.
  - Browser screenshot capture failed with a Browser CDP `Page.captureScreenshot` timeout; DOM, interaction, layout, and console checks were completed.
- Browser QA with Browser plugin at `http://127.0.0.1:5173/?demo=1&view=settings&theme=dark&seed=release&today=2026-06-17`:
  - Desktop `1280x720`: Settings loads, Version panel renders current/latest `v1.0.0`, manual Check updates shows a snackbar, and console warn/error logs are empty.
  - Mobile `390x844`: Settings uses a compact top sidebar, Version panel and buttons fit without horizontal overflow, snackbar fits within the viewport, dismiss button removes it, and console warn/error logs are empty.
