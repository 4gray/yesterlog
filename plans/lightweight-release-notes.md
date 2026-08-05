# Lightweight release notes

## Goal

Capture user-facing release context when a pull request is written, without
adding Changesets or altering Yesterlog's tag-driven release pipeline.

## Decisions

- Add a small pull request template with a required `Release note` section.
- Use one user-facing sentence for releasable changes and `None` for changes
  that should not appear in release notes.
- Tell repository agents to maintain that field when drafting pull requests.
- Make the canonical release flow use those fields as its primary curation
  input, while cross-checking GitHub's generated notes and the tag comparison.

## Work

- [x] Add the pull request template.
- [x] Add agent guidance.
- [x] Update the release skill.
- [x] Verify formatting and inspect the final diff.

## Verification

- `git diff --check` passed.
- Reviewed the pull request template, repository guidance, and release-skill
  curation flow together for consistent `Release note` / `None` handling.
- No application tests were run because the change only affects Markdown
  contributor and release-process documentation.
