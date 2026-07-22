# App icon variants

The active production icon is the Flat Cobalt artwork in `../app-icon.png`. Its source and the retained alternatives live under [`legacy-flat/`](legacy-flat/README.md):

- `01-flat-cobalt.png` — active full-color app icon.
- `02-flat-black.png` — retained monochrome-dark alternative.
- `03-flat-white.png` — retained monochrome-light alternative.
- `flat-cobalt-mark.png` — frameless brand mark for large marketing artwork.

Run `npm run assets:icons` after changing the production source to regenerate the Electron, platform, renderer, favicon, README, and website assets.
