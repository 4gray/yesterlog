---
name: release
description: Use when releasing, shipping, or cutting a new version of Yesterlog — bumping the version, publishing a build, tagging a release, or cutting a hotfix for 4gray/yesterlog. Triggers on "release", "ship a version", "cut a release", "publish a build", "hotfix".
argument-hint: "[patch|minor|major]"
---

# Release Yesterlog

End-to-end release flow for the public `4gray/yesterlog` Electron + Vite + React app (npm package and Snap name `yesterlog`). Pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which tests, builds and code-signs/notarizes macOS, builds Windows/Linux, creates a **DRAFT** GitHub Release, and uploads the Snap to `edge`. You then verify every artifact, curate the notes, promote the verified Snap revision, and hand the user the draft URL. **Do not publish the GitHub Release unless the user explicitly asks.**

The bump type comes from `$ARGUMENTS` (`$1`): `patch`, `minor`, or `major`. **Default to `patch`** when none is given.

## Procedure

### 1. Preconditions
- Release from `main`. The `chore(release)` commits live on `main`; this project does not use release branches.
- Confirm `git remote get-url origin` resolves to `4gray/yesterlog`, the Snap name is `yesterlog`, and Pages is configured as `main:/docs` at `https://4gray.github.io/yesterlog/`.
- Confirm the bump type. Map `$1` → script: `patch`→`release:patch`, `minor`→`release:minor`, `major`→`release:major`. If `$1` is empty, use `patch`.
- The working tree must be **clean** before bumping — `npm version` aborts on a dirty tree. So commit the actual fix/feature FIRST (step 2).
- **The latest `main` CI run must be GREEN before you tag.** The release workflow re-runs the same `test` job (unit tests + renderer E2E + build), so a red pipeline on `main` fails the release too. If any commits are already on `main`, verify their CI passed before releasing:
  ```bash
  gh run list --workflow=ci.yml --branch main --limit 1 --json headSha,status,conclusion -q '.[0]'
  # Require: status == "completed", conclusion == "success", and headSha == the commit you're about to tag.
  # If it's failing or still in progress, fix/wait BEFORE bumping — never tag on a red main.
  ```
  ⚠️ `npm run test` does **not** run the renderer E2E (`e2e/renderer.e2e.mjs`); a UI change can pass `test` locally yet break `e2e:renderer` in CI. Always gate on the real pipeline (above) and/or `release:dry-run` (below), not `npm run test` alone.
- (Recommended) Validate locally before tagging — this mirrors the CI `test` job exactly:
  ```bash
  npm run release:dry-run
  ```
  (= brand audit + `npm run test && npm run e2e:renderer && npm run build`)

### 2. Commit the change
Commit the real fix/feature with a conventional-commit subject and a body explaining the why:
```bash
git add -A
git commit -m "fix: <subject>" -m "<why this change>"
```
Verify the tree is now clean (must print nothing):
```bash
git status --porcelain
```

### 2b. Refresh release screenshots (feature releases)
If the release changes a primary view, refresh its screenshot for the notes/docs **before** bumping — the tag must include it, and GitHub Pages (`main:/docs`, public) serves it for the notes. Capture with the demo seed:
```bash
npm run screenshots -- --seed release --today 2026-06-17 --views today --out docs/screenshots/v<NEW>
# omit --views to refresh the full set; add a second run with --themes light for light-<view> shots
```
- **Screenshots are auto-compressed** to a palette PNG by `scripts/capture-screenshots.mjs` (a full-view 1440×1000 shot is ~30 KB instead of ~120 KB), so committing them to `docs/` stays cheap. Do not hand-optimize.
- Commit the PNG(s) under `docs/screenshots/v<NEW>/`. If you refreshed the whole set, also bump the `screenshots/v…/` paths in `README.md` and `docs/index.html` so they don't point at the old version.
- Reference the shot in the notes (step 7) via its public Pages URL — it renders inline: `https://4gray.github.io/yesterlog/screenshots/v<NEW>/<theme>-<view>.png` (e.g. `.../v2.1.0/dark-today.png`). Confirm it's live with `curl -sI <url>` (expect `200`) once `main` is pushed.

### 3. Bump version + create the tag
Run the project script for the chosen bump type (default `patch`):
```bash
npm run release:patch    # or: npm run release:minor / npm run release:major
```
Each expands to `npm version <type> -m "chore(release): v%s"`, which in one step:
- updates `"version"` in `package.json` **and** `package-lock.json`,
- creates a `chore(release): vX.Y.Z` commit, and
- creates the annotated tag `vX.Y.Z`.

Capture the new version and tag for later steps (read it from `package.json` — don't hardcode a version, it drifts every release):
```bash
NEW=$(node -p "require('./package.json').version")   # e.g. 2.1.0
TAG="v$NEW"                                           # e.g. v2.1.0
echo "$TAG"
```

### 4. Push the commit and the tag
```bash
npm run release:push     # = git push && git push --tags
```
The tag push (`vX.Y.Z`, matching `on: push: tags: "v*.*.*"`) is what triggers the Release workflow.

### 5. Find the pipeline run, then watch it in the BACKGROUND
Resolve the run id for this tag (the workflow runs against the tag ref):
```bash
RUN_ID=$(gh run list --workflow=release.yml --branch "$TAG" --limit 1 --json databaseId -q '.[0].databaseId')
echo "$RUN_ID"
```
Watch it to completion **in the background** (the build takes ~5-6 min) so you're notified when it finishes:
```bash
gh run watch "$RUN_ID" --exit-status --interval 20
```
Run that `gh run watch` command with `run_in_background: true`.

### 6. What the pipeline does
Jobs run in order, all from the **tagged commit**:
1. `test` (ubuntu-latest) — `npm ci`, `npm run test`, `npx playwright install --with-deps chromium`, `npm run e2e:renderer`, `npm run build`.
2. `build` (`needs: test`, matrix, `fail-fast: false`) — three platforms in parallel:
   - **macOS** (`macos-latest`, artifact `yesterlog-macos`): runs `npm run dist:mac -- -c.mac.forceCodeSigning=true` with code-signing + notarization (the `mac` build config has `notarize: true` and `hardenedRuntime: true`). Produces `release/*.dmg`, `release/*.zip`.
   - **Windows** (`windows-latest`, artifact `yesterlog-windows`): `npm run dist:win`, unsigned. Produces `release/*.exe`, `release/*.zip`.
   - **Linux** (`ubuntu-latest`, artifact `yesterlog-linux`): `npm run dist:linux`, unsigned. Produces `release/*.AppImage`, `release/*.deb`, `release/*.tar.gz`.
3. `snap` (`needs: test`, ubuntu-latest) — builds `yesterlog_<version>_amd64.snap` and uploads the workflow artifact `yesterlog-snap`.
4. `publish_snap` (`needs: snap`, ubuntu-latest, release tags only) — uploads the exact Snap artifact to Snapcraft `edge` when `SNAP_STORE_PUBLISH_ENABLED` is enabled.
5. `publish` (`needs: [build, snap]`, ubuntu-latest, only when `startsWith(github.ref, 'refs/tags/v')`) — downloads all artifacts into `release-assets/`, then **creates the release if it doesn't exist, or `gh release upload --clobber` if it does**:
   ```bash
   gh release create "$TAG_NAME" "${assets[@]}" \
     --draft \
     --title "$TAG_NAME" \
     --generate-notes \
     --verify-tag
   ```
The result is a **DRAFT** GitHub Release titled `vX.Y.Z` with `.dmg/.zip/.exe/.AppImage/.deb/.tar.gz` attached and auto-generated notes.

### 7. Confirm the draft and curate the release notes
After the run succeeds, confirm the draft exists:
```bash
gh release view "$TAG" --json isDraft,url,assets -q '{isDraft, url, assets: [.assets[].name]}'
```
Replace the auto-generated notes with a **curated, user-facing changelog**. Determine the previous tag for the compare link:
```bash
PREV=$(git tag --sort=-v:refname | grep -v "^$TAG$" | head -1)   # e.g. v1.3.2
```
Use the generated draft to identify the included pull requests, then inspect each pull request's `## Release note` section:
```bash
gh release view "$TAG" --json body -q .body
PR_NUMBER=37 # replace with each pull request number from the generated notes
gh pr view "$PR_NUMBER" --repo 4gray/yesterlog --json title,body,url
```
- Treat a non-`None` `## Release note` as the primary user-facing input. Combine and polish entries for a coherent release; do not copy raw commit subjects or implementation details into the final notes.
- Omit entries marked exactly `None`. For older pull requests without the section, fall back to their title and body.
- Cross-check `git log "$PREV..$TAG"` and the full compare link so direct commits, stale pull request descriptions, and meaningful changes omitted by generated notes are caught. Resolve mismatches from the actual shipped diff rather than blindly trusting the pull request field.

Write `/tmp/notes.md` (group changes under headings like **Highlights**, **Fixes**, **Improvements** — describe user-visible impact, not raw commit subjects). For a feature release, embed the screenshot captured in step 2b via its public Pages URL (it renders inline; a committed private-repo raw/asset URL would NOT). ALWAYS end with the compare link:
```markdown
## What's new in vX.Y.Z

### Highlights
- ...

![<view> view](https://4gray.github.io/yesterlog/screenshots/vX.Y.Z/dark-<view>.png)

### Fixes
- ...

**Full changelog:** https://github.com/4gray/yesterlog/compare/vPREV...vX.Y.Z
```
Apply the notes to the draft (this does not publish it):
```bash
gh release edit "$TAG" --title "$TAG" --notes-file /tmp/notes.md
```

### 8. Verify and promote the Snap revision
On Ubuntu, install the exact `edge` revision produced by the workflow and verify startup, the clean first-run profile, Jira/network access, browser links, notifications, and desktop integration:
```bash
snap info yesterlog
sudo snap install yesterlog --edge
# If already installed:
sudo snap refresh yesterlog --edge
```
After verification, promote that same revision without rebuilding it:
```bash
snapcraft promote yesterlog --from-channel=edge --to-channel=candidate
snapcraft promote yesterlog --from-channel=candidate --to-channel=stable
snap info yesterlog
```
Never release a different revision to `candidate` or `stable`. For the first Yesterlog release, confirm the public stable listing before making the legacy Snap private.

### 9. Hand the URL to the user — leave it as a DRAFT
Give the user the draft release URL and tell them it's ready for review:
```bash
gh release view "$TAG" --json url -q .url
```
**Stop here.** The release stays a DRAFT for the user to review and Publish themselves. **Only** publish when the user explicitly asks, with:
```bash
gh release edit "$TAG" --draft=false
```

## Gotchas

- **The shipped version comes from the BUILD, not from any runtime string.** In the renderer, `import.meta.env.VITE_APP_VERSION` is injected at build time by a Vite `define` in `vite.config.ts` (`"import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version)`), read in `src/App.tsx` and `src/api/native.ts`. In the Electron main process, `app.getVersion()` (`electron/main.ts`) reads the bundled `package.json`. CI builds from the **tagged commit**, so the version bump must be committed + tagged BEFORE the build — which is exactly why the tag push is the trigger. Never hand-edit a version string anywhere else; bump only via `npm version` (step 3).
- **Clean tree is mandatory.** `npm version` (inside `release:patch/minor/major`) refuses a dirty working tree and aborts. Commit your real change first (step 2).
- **A local `npm run dist:mac` is UNSIGNED** (it runs with `--publish never` and no signing secrets) and is stamped with whatever `package.json` version exists at that moment. Use it only for quick personal testing — never as the release artifact. The signed/notarized macOS build only happens in CI via repo secrets (`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`). If any macOS signing secret is missing, the macOS build job fails fast at the "Check macOS signing secrets" step; Windows and Linux need no signing.
- **The tag pattern must be semver `vX.Y.Z`.** Only `v*.*.*` triggers the release on push. A manual `workflow_dispatch` run executes `test` + `build` but **skips `publish`** (gated on `startsWith(github.ref, 'refs/tags/v')`), so no release is created from a branch dispatch.
- **The publish job is idempotent.** Re-running it when the release already exists uses `gh release upload --clobber` rather than recreating it, so re-runs overwrite assets instead of duplicating the release.
- **Identity is consistent:** GitHub repo `4gray/yesterlog`, npm package `yesterlog`, Snap `yesterlog`, electron-builder `productName` `Yesterlog`, and Pages `https://4gray.github.io/yesterlog/`.
- **Snap credentials are least-privilege.** `SNAPCRAFT_STORE_CREDENTIALS` must be restricted to Snap `yesterlog` and channel `edge`; promotion is a separate deliberate post-verification action.
- **Validate before tagging** with `npm run release:dry-run` (= brand audit + `npm run test && npm run e2e:renderer && npm run build`) to avoid pushing a tag that fails CI.
