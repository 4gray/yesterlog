# Linux Packaged Icon

## Goal

Fix Linux packaged app icons by giving electron-builder a multi-size hicolor icon set and matching desktop/window metadata.

## Decisions

- Generate Linux PNG icons under `build/icons/` alongside existing macOS, Windows, and renderer icons.
- Point `build.linux.icon` at the icon directory instead of a single 1024px PNG.
- Set `desktopName` and enable `linux.syncDesktopName` so Linux desktops can associate the running Electron window with the installed `.desktop` file.

## Pending Work

- Commit and push all pending changes.

## Verification

- `npm run assets:icons` passes and writes `build/icons/{16,24,32,48,64,128,256,512,1024}x{size}.png`.
- `npm run test` passes.
- `npm run build` passes.
- `npx electron-builder --linux dir --publish never` passes.
- Direct `app-builder-lib` icon conversion against `build/icons` returns all generated sizes without fallback.
