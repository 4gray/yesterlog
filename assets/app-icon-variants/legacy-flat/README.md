# Legacy Flat app-icon assets

These tracked 1024×1024 transparent PNG assets preserve the selected Legacy XL Flat Source geometry. Flat Cobalt is the current production icon; the monochrome versions remain available for future experiments.

## Full app-icon candidates

- `01-flat-cobalt.png` — active production source: cobalt outer body, white task card, light-blue rear card, blue checkbox, and blue clock badge.
- `02-flat-black.png` — monochrome black treatment: charcoal outer body, soft-white task card, neutral-gray rear card, and black task/time details.
- `03-flat-white.png` — inverse monochrome white treatment: soft-white outer body, graphite task card, neutral-gray rear card, and white task/time details.

All three keep the same large task-card/clock composition and avoid baked drop shadows, bevels, and perimeter frames. Small-size `64`, `32`, and `16` pixel previews live under `previews/`.

## Frameless mark

- `flat-cobalt-mark.png` — the color task-card, checkbox, worklog bars, rear card, and clock badge isolated on a transparent 1024×1024 canvas. It has no outer app-icon squircle and is used for the website's large brand artwork.

The mark also has `128`, `64`, and `32` pixel previews.

## Comparison files

- `comparison.png` — three full candidates plus the frameless mark.
- `dock-comparison.png` — the three full candidates on dark and light shelves plus a 32px row.

To promote a different full icon later, copy it over `assets/app-icon.png` and run:

```bash
npm run assets:icons
```
