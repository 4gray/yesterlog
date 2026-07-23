# Yesterlog rebrand

## Goal

Rename the desktop app, repository, GitHub Pages site, release pipeline, and
Snap Store package to Yesterlog, then prepare the major `v3.0.0` release.

## Decisions

- Public identity: `Yesterlog`, package/repository/Snap slug `yesterlog`,
  application ID `io.github.fourgray.yesterlog`.
- Keep the existing neutral app icon and visual language.
- Preserve desktop data by migrating the most recent pre-rebrand profile, with
  the original tracker profile as a fallback. Snap starts with a clean profile.
- Keep the legacy Windows NSIS upgrade GUID so the renamed installer replaces
  existing installs.
- Use `.codex/skills/release/SKILL.md` as the canonical release procedure.
- Keep existing GitHub releases and history; leave the new GitHub release as a
  draft until the user explicitly approves publication.

## Work

- [x] Register the public `yesterlog` Snap name.
- [x] Implement code, packaging, content, docs, workflow, and migration changes.
- [x] Add automated brand-audit coverage.
- [x] Verify tests, builds, migration, screenshots, rendered UI, and package metadata.
- [x] Rename the GitHub repository and Pages site; refresh Snap credentials.
- [x] Run the canonical major-release procedure and verify the draft and Snap.

## Verification

- Snap name `yesterlog` registered on 2026-07-23.
- Brand audit passed; only migration compatibility code/tests and DEB replacement metadata are allowlisted.
- Desktop migration tests passed, including primary/fallback selection, repeat runs, failure fallback, and Snap bypass.
- A copy of the real desktop profile migrated byte-for-byte for `IndexedDB`,
  `Local Storage`, and `window-state.json`; the source copy remained unchanged.
- Full Vitest: 125 files / 821 tests passed. Renderer E2E: 8 tests passed.
- Production build passed. The full 18-image dark/light `v3.0.0` screenshot set
  was generated without browser console or page errors.
- App and Pages rendered QA passed at desktop and mobile widths with no
  clipping, document overflow, console errors, or old visible branding.
- Local macOS, Windows NSIS, DEB, and staged Snap builds accepted the packaging
  config. Bundle ID, app names, NSIS GUID, DEB replacement metadata, Linux
  desktop entry, Snap name/title, and Pages URL were inspected.
- `npm audit --omit=dev` still reports the existing transitive `js-yaml`
  high-severity advisory; no dependencies changed for this rebrand.
- Rebrand commit `4e2d7ef` is on `main`; exact-main CI run `29989331891`
  passed, and the renamed Pages site plus `v3.0.0` screenshot URLs return 200.
- The Snap Store credential is restricted to `yesterlog`/`edge` and stored as
  the `SNAPCRAFT_STORE_CREDENTIALS` GitHub secret.
- Canonical release preconditions passed on exact `main` commit `badd2a2`:
  clean tree, green CI run `29991242912`, and the complete
  `npm run release:dry-run` suite.
- The release skill created commit `9f6dfee` and tag `v3.0.0`; release workflow
  `29991396971` built all 14 macOS, Windows, Linux, update-manifest, and Snap
  assets successfully.
- GitHub Release `v3.0.0` has curated Yesterlog notes and remains a draft,
  pending explicit publication approval.
- Snap Store revision `1` passed clean-Ubuntu install, metadata/interface, X11
  launch, and clean-profile checks in smoke run `29996242873`.
- The same Snap revision `1` is published as version `3.0.0` in `edge`,
  `candidate`, and `stable`; final package metadata and the icon were synced to
  the public Store listing. The legacy Snap remains private.
