# macOS signing CI

## Goal

Make GitHub Actions produce signed and notarized macOS TimeBro release artifacts so Gatekeeper accepts the downloaded app.

## Decisions

- Keep the existing release matrix and artifact publishing flow.
- Use `electron-builder` macOS signing with a base64 Developer ID Application `.p12` certificate.
- Use App Store Connect API key notarization for CI instead of Apple ID app-specific passwords.
- Store the `.p8` API key as `APPLE_API_KEY_BASE64`, then decode it to a temporary file because this `electron-builder` version passes `APPLE_API_KEY` to `@electron/notarize` as a file path.
- Force code signing in the macOS CI job so a misconfigured certificate fails the release instead of producing an unsigned package.
- Keep signing secrets in GitHub Actions repository secrets.

## Work Items

- Inspect current release workflow and Electron builder config. Done.
- Add hardened runtime entitlements for Electron. Done.
- Configure macOS signing/notarization in `package.json`. Done.
- Pass macOS signing and notarization secrets only to the macOS Actions job. Done.
- Document where to create Apple credentials and which GitHub secret names to use. Done.
- Run tests/build. Done.
- Provision GitHub Actions signing secrets in the repository. Done.
- Revoke the two earlier TimeBro App Store Connect API keys that were generated before the successful Chrome download. Done.
- Commit the signing changes onto current `main`, push them, and move `v1.0.0` to the resulting commit so the release workflow rebuilds signed artifacts. In progress.
- Preserve the existing draft release notes when GitHub creates the replacement `v1.0.0` draft. Pending workflow completion.

## Verification

- `npm ci` passed and reported 0 vulnerabilities.
- `npm run test` passed: 9 files, 26 tests.
- `npm run build` passed.
- `.github/workflows/release.yml` parsed as valid YAML.
- `package.json` parsed as valid JSON.
- `plutil -lint build/entitlements.mac.plist build/entitlements.mac.inherit.plist` passed.
- `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --publish never -c.mac.notarize=false` passed, validating the macOS packaging config without CI secrets.
- Full signed `npm run dist:mac` was not run locally because it requires the real Apple Developer certificate and App Store Connect secrets in CI.
- `gh secret list --repo 4gray/time-bro` shows all six required repository secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `APPLE_TEAM_ID`.
- App Store Connect now shows active keys `HG55VW4Z24` and `HGWTQFKGP4`; the earlier TimeBro keys `6K8CXJHYN5` and `DGXBF23Q86` are listed under revoked keys.
