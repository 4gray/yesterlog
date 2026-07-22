# App Icon Refresh

## Goal

Replace every production copy of the legacy stacked-card icon with the selected Midnight Cyan Ticket Clock, generate all desktop/web sizes, and preserve three alternate color studies as versioned fallback sources.

## Decisions

- Use the refined Midnight Cyan raster concept as the production source of truth.
- Normalize the production source and fallbacks to 1024x1024 PNG with transparent rounded corners.
- Update the existing icon generator to consume `assets/app-icon.png` instead of the retired SVG source.
- Generate Electron macOS ICNS, Windows ICO, Linux PNG sizes, renderer PNGs, favicons, Apple touch icon, manifest assets, and the docs icon from the same source.
- Remove stale SVG copies and update README/docs/browser references to generated PNG assets.
- Store Cobalt Check, Safety Orange, and Light Cobalt under `assets/app-icon-variants/` for future experiments.

## Work

- [x] Prepare the selected production PNG and three fallback PNGs with correct alpha.
- [x] Update the icon generator and all icon references from SVG to PNG.
- [x] Remove stale legacy SVG icon files.
- [x] Run the generator and inspect representative large and small outputs.

## Verification

- [x] Confirm every expected PNG size plus ICNS and ICO is generated.
- [x] Confirm transparent corners and readable 1024/64/32/16 rendering.
- [x] Run tests and production build.
- [x] Confirm fallback variants are visible to Git and no legacy icon references remain.
