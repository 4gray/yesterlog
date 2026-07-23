# AI provider copy refresh

## Goal

Update public and repository messaging to reflect Ollama, OpenAI, and Anthropic
provider support without weakening the deterministic, local-first product
promise.

## Decisions

- State that reconstruction and core tracking work without an AI provider.
- Present Ollama as the fully private, local provider.
- Present OpenAI (via the Codex CLI) and Anthropic (via the Claude CLI) as
  optional cloud providers that use the user's existing CLI authentication.
- Explain that TimeBro applies best-effort redaction before cloud prompts leave
  the device, without implying that cloud processing is private or local.
- Preserve the no TimeBro backend and no telemetry claims.

## Work

- [x] Audit provider behavior and stale copy across the repository.
- [x] Update README, package metadata, website, and agent guidance.
- [x] Update the GitHub repository description.
- [x] Update and verify the Snap Store listing description.
- [x] Run focused copy checks, production build, and public-page verification.

## Verification

- `npm run test`: 123 files and 813 tests passed.
- `npm run build`: production renderer and Electron TypeScript builds passed.
- Local and deployed website checks: provider/privacy copy rendered without
  horizontal overflow or console errors.
- GitHub About description was read back after the update.
- Snapcraft dashboard reported `Changes applied successfully`; the public Store
  page then showed the Ollama, Anthropic, and OpenAI provider copy.
- GitHub CI and Pages deployment for commit `8137695` completed successfully.
