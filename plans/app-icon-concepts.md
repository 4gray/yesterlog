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
- The installed Dock result exposed a small-scale failure: the polished outer rim reads as a white halo, the screws and minute ticks disappear, and the dark layered housing loses optical mass against a dark Dock. Treat this as a design-frequency problem, not an SVG/ICNS packaging problem.
- Explore a Dock-first eighth round with three simplified families: Hardware Flat, Ticket Dial, and Light Enamel. Keep each concept non-destructive and judge the 64/32/16 px renders before proposing a replacement.
- The Dock-first clock studies improved legibility but moved too far from the earlier TimeBro identity. Recover the exact pre-Ticket-Stopwatch production icon from Git and use it as the locked reference for a ninth round.
- Preserve the legacy icon's core recognition stack: cobalt system squircle, one dominant white ticket/card, a compact blue checkbox/task chip, and one clock badge. Apply the new small-size constraints by removing rear-card clutter, enlarging the front ticket, simplifying its lines/fold, strengthening the task/time relationship, and avoiding baked outer frames or micro-detail.
- User selected Legacy XL as the new direction. Explore a tenth round that locks its geometry while testing a warm light inversion, a dark appearance palette, and a shadowless source-art treatment.
- Follow current Apple guidance by keeping source artwork frontal, simple, and suitable for layers. Compare fully flat internal layers against the selected softly shaded raster baseline; avoid hard baked drop shadows either way.
- User selected the shadowless Flat Source direction for final comparison. Preserve its exact geometry as a 1024px cobalt asset, generate strict monochrome black and inverse-white variants, and extract the color task-card/clock mark onto transparency without the outer squircle.
- Store the three full app-icon candidates plus the frameless mark under tracked `assets/app-icon-variants/legacy-flat/`; do not promote any candidate to production until the user chooses.

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
- [x] Generate the Dock-first eighth-round studies without changing production icon assets.
- [x] Build 64/32/16 px previews and a Dock-scale comparison strip.
- [x] Inspect silhouette, haloing, contrast, and ticket/time-tracking recognition; recommend the strongest direction.
- [x] Recover and verify the exact legacy production icon from Git history.
- [x] Generate three Dock-first legacy-icon reinterpretations without changing production assets.
- [x] Build 64/32/16 px previews and compare them with both the legacy and current production icons.
- [x] Recommend the strongest legacy-derived direction.
- [x] Generate light, dark, and shadowless Legacy XL color/material studies with locked composition.
- [x] Build a side-by-side Dock comparison against the selected Legacy XL baseline at 64/32/16px.
- [x] Recommend whether the flattened Electron asset should be fully flat or retain minimal ambient separation.
- [x] Generate black and white Flat Source variants with locked geometry and no shadows.
- [x] Extract the color inner mark without the outer app-icon body.
- [x] Normalize all deliverables to 1024px transparent PNG assets and document them.
- [x] Verify the three app-icon candidates at 64/32/16px and keep production assets unchanged.

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
- [x] Confirm every eighth-round study is square, saved in the workspace, and production icon assets remain unchanged.
- [x] Confirm every ninth-round study has transparent corners, no chroma fringe, and remains legible at 32px.
- [x] Confirm every tenth-round study preserves the Legacy XL geometry and production assets remain unchanged.
- [x] Confirm all tracked Flat Source candidate assets have transparent corners/backgrounds, no chroma fringe, and readable small-size previews.
