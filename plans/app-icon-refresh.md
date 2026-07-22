# App Icon Refresh

## Goal

Promote the selected Flat Cobalt Legacy XL artwork to every production app-icon target, preserve the new Flat Black, Flat White, and frameless mark assets, remove the superseded Ticket Stopwatch fallbacks/concepts, and choose the strongest new asset treatment for the website and README.

## Decisions

- Use `assets/app-icon-variants/legacy-flat/01-flat-cobalt.png` as the new production source of truth.
- Normalize the production source and fallbacks to 1024x1024 PNG with transparent rounded corners.
- Update the existing icon generator to consume `assets/app-icon.png` instead of the retired SVG source.
- Generate Electron macOS ICNS, Windows ICO, Linux PNG sizes, renderer PNGs, favicons, Apple touch icon, manifest assets, and the docs icon from the same source.
- Remove stale SVG copies and update README/docs/browser references to generated PNG assets.
- Preserve Flat Cobalt, Flat Black, Flat White, and the frameless Cobalt mark under `assets/app-icon-variants/legacy-flat/`.
- Remove the superseded Cobalt Check, Safety Orange, Light Cobalt, and Ticket Stopwatch concept rounds.
- Keep the full Flat Cobalt icon for favicons, navigation, footer, README, Electron, and platform packages; use the frameless mark for the large decorative website artwork.

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

## Follow-up CI hotfix

- [x] Update the concurrently merged Recap view to import the production PNG instead of the retired SVG.
- [x] Re-run tests and the production build on the combined `main` state.

## Flat Cobalt promotion

- [x] Replace `assets/app-icon.png` with the selected Flat Cobalt asset.
- [x] Generate every Electron, renderer, web, docs, ICNS, ICO, and Linux size.
- [x] Add the frameless docs mark to the generator and use it for the website's large brand artwork.
- [x] Remove superseded tracked clock fallbacks and move ignored Ticket Stopwatch concept directories out of the workspace.
- [x] Update fallback documentation and confirm README uses the generated Flat Cobalt icon.
- [x] Inspect the docs site and representative 1024/64/32/16 assets.
- [x] Run tests and the production build.
