# Snap Store packaging

## Goal

Ship TimeBro as a strictly confined `core24` Snap, build it in the release
workflow, and prepare controlled publication through the Snap Store.

## Decisions

- Use electron-builder's Snap target so the existing desktop packaging remains
  the source of truth.
- Target `core24` with strict confinement and the GNOME extension.
- Request only `network`, `home`, and normal `browser-support` interfaces in
  addition to the desktop interfaces supplied by the GNOME extension.
- Let Snap manage Snap-package updates; never offer Snap users a GitHub `.deb`
  installer.
- Build `amd64` first. Add `arm64` later through a native or remote builder
  after the first Store release is verified.
- Upload release-tag builds to the Store's `edge` channel. Promotion to
  `candidate` or `stable` remains an explicit maintainer action.
- License the project under MIT, with `fourgray` as the copyright holder.

## Work

- [x] Register the public `timebro` name with the intended publisher.
- [x] Add MIT licensing.
- [x] Configure restricted Store credentials in GitHub Actions.
- [x] Add Snap build configuration and scripts.
- [x] Add Snap-aware update behavior and tests.
- [x] Add Snap build and `edge` publication to release CI.
- [x] Document Store metadata, testing, and promotion.
- [x] Verify tests, production build, workflow, and packaging config.
- [ ] Repair the hosted Ubuntu Snap build after the v2.7.1 LXD networking
  failure by using Canonical's supported GitHub build action.
- [ ] Verify the repaired tagged release uploads `timebro` to the Store's
  `edge` channel.

## External actions

- Complete Store listing metadata and media.
- Test the Store revision on Ubuntu and promote it beyond `edge`.

## Verification

- Focused updater/settings tests: 23 passed.
- Full Vitest suite: 123 files and 813 tests passed.
- Renderer E2E: 8 tests passed.
- Production TypeScript/Vite/Electron build: passed.
- electron-builder 26.15.3 generated-descriptor assertions: passed for
  `amd64`, name, `core24`, strict confinement, stable grade, title, summary,
  command, GNOME extension, plugs, and icon.
- Release workflow YAML, Store media, and whitespace checks: passed.
- Browser review of Settings → About: no clipping, overflow, console warnings,
  or console errors.
- The first v2.7.1 hosted build reached Snapcraft, but GitHub runner forwarding
  prevented LXD from downloading its Ubuntu 24.04 base image. The repair keeps
  the real `.snap` build on Ubuntu 24.04 and delegates LXD/network setup to
  Canonical's `snapcore/action-build` action.
- `npm audit --omit=dev` reports one existing high-severity `js-yaml` advisory
  inherited through electron-updater/build tooling; no dependencies changed in
  this packaging task.
