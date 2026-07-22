# App icon concepts

## Goal

Audit TimeBro's current product and icon, then develop the selected Ticket Stopwatch direction into Apple-style macOS 27 variants with a sharper, larger central mark and restrained neo-brutalist character.

## Decisions

- Preserve the existing brand world unless the audit reveals a stronger product-native symbol.
- Treat generated images as concept exploration only; do not replace production icon assets without user selection.
- Generate each distinct concept separately with the built-in image generation tool.
- Judge concepts at 1024 px and at dock-scale thumbnails, prioritizing silhouette, optical fill, and small-size clarity.
- Keep the current cobalt-blue Apple squircle as the continuity anchor, but use the app's warm off-white, graphite, teal, and amber accents more deliberately.
- Explore four symbol families: terminal clock, time-block timeline, bear-clock mascot, and simplified ticket stopwatch.
- User selected Ticket Stopwatch for further exploration. Keep the previous draft as a reference, not an edit target to overwrite.
- Re-check the direction against current official Apple design guidance before generating the second round.
- The flat second-round geometry is directionally correct but visually under-articulated. Explore controlled neo-skeuomorphism: frontal layered objects with tactile material cues, while avoiding old-style photographic perspective and excessive baked effects.
- User selected the anodized-instrument treatment for a structural revision: remove the ticket silhouette, expand the clock face to become the full icon, move the metal border to the outer icon edge, add four corner screws, and strengthen the hour/minute scale.
- Full-dial studies read too much like a generic clock app. Preserve the recommended graphite instrument and four screws while introducing one strong ticket-tracking signal per study: ticket notches, a task checkbox, logged-time blocks, or a restrained hybrid.
- User selected the explicit Ticket Bezel study. Explore an asymmetric checkmark-shaped pair of clock hands while keeping the clock mechanism legible, and test alternate palettes without losing the ticket silhouette.
- User chose the Midnight Cyan checkmark study for refinement: reduce the neon intensity, restore a warm amber pivot, and shorten the left hand while locking the remaining construction.
- User approved the refined Midnight Cyan Ticket Clock for production. Preserve Cobalt Check, Safety Orange, and Light Cobalt as versioned fallback sources.

## Audit notes

- The current icon combines a foreground ticket, two rear cards, a folded corner, a checkbox, two text rows, and a separate clock badge. Its story is accurate but its hierarchy collapses at Dock scale.
- The foreground symbol uses roughly the middle half of the squircle, leaving excessive optical padding; the small clock badge becomes the only recognizable detail at 32-64 px.
- TimeBro's most distinctive product behavior is not a generic stopwatch: it turns Jira worklogs, local rituals, commits, reviews, and personal notes into draggable blocks on Today/Week/Reconstruct timelines, then exposes gaps and totals.
- The product's secondary identity signals are local-first privacy, command-palette/CLI fluency, optional local or CLI AI polish, and the friendly "Bro" tone.
- Apple's June 2026 guidance uses one layered icon system across iOS, iPadOS, and macOS. Artwork should be exported as square, unmasked layers and composed in Icon Composer.
- For the macOS 27 round, remove baked shadows, blur, bevel, gradients, and translucency from source artwork; keep a frontal view, rounder geometry, bold weights, strong mono contrast, and let Icon Composer add material effects.
- Apple recommends evaluating every size, using colored backgrounds for clear mode separation, and reviewing the sharper, less-translucent 2026 rendering plus specular and refraction behavior.

## Work

- [x] Audit current icon geometry, source assets, packaging config, product features, and visual tokens.
- [x] Define a compact symbol vocabulary and 3-4 differentiated directions.
- [x] Generate, inspect, and if needed refine one image per direction.
- [x] Save preview concepts in the workspace and summarize recommendations.
- [x] Review official Apple macOS 27 icon guidance and translate it into concrete corrections.
- [x] Generate several non-destructive Ticket Stopwatch variants, including a flatter no-shadow treatment and alternate backgrounds/geometries.
- [x] Inspect the second round at Dock and favicon sizes, then recommend the strongest candidate.
- [x] Generate a third material-study round using enamel, anodized metal, tactile paper, and precision-instrument treatments.
- [x] Inspect the richer variants at 64/32/16 px and distinguish useful material depth from decorative noise.
- [x] Generate a fourth round of full-dial anodized instrument variations with four corner screws and clearer clock markings.
- [x] Inspect the full-dial variants at 64/32/16 px and recommend the most legible balance of instrument detail and Apple-style simplicity.
- [x] Generate a fifth round integrating ticket/task-tracking cues into the full-dial graphite instrument.
- [x] Inspect the tracking cues at 64/32/16 px and recommend the clearest non-generic metaphor.
- [x] Generate a sixth round of Ticket Bezel variants with checkmark-shaped clock hands and alternate color systems.
- [x] Inspect checkmark readability versus generic todo-app risk at 64/32/16 px.
- [x] Generate and inspect a targeted Midnight Cyan refinement with a calmer bezel, amber pivot, and stronger checkmark asymmetry.

## Verification

- [x] Confirm generated files are readable and square (four 1254x1254 RGB PNGs).
- [x] Create and inspect 64, 32, and 16 px previews to catch blur, weak silhouette, or undersized marks.
- [x] Confirm production icon assets remain unchanged.
- [x] Confirm every second-round variant is square, readable at 64/32/16 px, and saved beside the first-round concepts.
- [x] Confirm every material-study variant is saved non-destructively and production icon assets remain unchanged.
- [x] Confirm every full-dial variant is saved non-destructively and production icon assets remain unchanged.
- [x] Confirm every ticket-tracking variant is saved non-destructively and production icon assets remain unchanged.
- [x] Confirm every checkmark-hand color variant is saved non-destructively and production icon assets remain unchanged.
- [x] Save the selected refinement non-destructively, verify 64/32/16 px, and confirm production assets remain unchanged.
