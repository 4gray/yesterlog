# App Icon Refresh

## Goal

Replace the TimeBro app icon with the selected stacked worklog card plus clock badge direction, then generate desktop app icons, favicon assets, and README branding from the new source.

## Decisions

- Use a crisp project-owned SVG source as the production source of truth instead of cropping a raster concept board.
- Preserve the cobalt-blue rounded-square base and card stack motif.
- Make the time-tracking metaphor explicit with a small clock badge pinned to the card.
- Keep generated OS icons under `build/` and renderer/README assets under `src/assets/`.

## Pending Work

- None.

## Verification

- Icon generation succeeded with `npm run assets:icons`.
- Opened generated 1024px, 192px, and 32px assets for visual inspection.
- `npm run test` passed: 9 files, 26 tests.
- `npm run build` passed, including Vite favicon/manifest output and Electron TypeScript compilation.
- `npm install` audit step reported 0 vulnerabilities after installing local dependencies.
