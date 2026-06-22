# Release 1.1.0

## Goal

Prepare the `v1.1.0` GitHub draft release for manual review and publishing.

## Decisions

- Treat this as a minor release from `v1.0.0` to `v1.1.0`.
- Keep the GitHub release as a draft; the user will publish it manually.
- Include a new dark Weekly View screenshot in release notes.
- Generate release notes from the changes after `v1.0.0`, then replace the generated draft body after CI publishes assets.

## Pending Work

- Bump package metadata to `1.1.0`. Done.
- Capture the new Weekly View release screenshot under `screenshots/v1.1.0/`. Done.
- Run release verification. Done.
- Commit, tag, and push `v1.1.0`. Pending.
- Wait for the GitHub Actions release workflow to create/update the draft release.
- Update the draft release notes with the screenshot and changelog.

## Verification

- `npm run screenshots -- --views week --themes dark` passed and wrote `screenshots/v1.1.0/dark-week.png`.
- Visual inspection confirmed the Weekly View screenshot is usable for release notes.
- `npm run test` passed: 16 test files, 55 tests.
- `npm run build` passed.
