# Preserve time-entry form state across tabs

- Goal: preserve selected date/time and form drafts when switching between Jira time, personal notes, and meetings from Today, Week, Reconstruction, and other entry points.
- Completed: traced Today/Week calendar and Reconstruction prefills through the shared AddTimeModal; reproduced failures before fixing them.
- Decisions: Jira and personal notes share date/start/duration and duration controls; text/title/category/ticket stay specific to their forms. Recurring events retain their scheduled start and keep duration/note drafts per event and date. New entry targets or closed/reopened modals reset the session.
- Related fixes: reopening Custom keeps the current preset duration; working-day/target refreshes no longer clear drafts; recurring candidate refreshes cannot pair a new event with another event's note/duration.
- Verification: 953 Vitest tests passed (136 files), all 11 renderer E2E scenarios passed, production build passed, git diff --check passed. Browser tests drag 75-minute slots in Today/Week and verify saved intervals, and exercise reconstructed ticket/comment prefills plus recurring drafts. Inspected the rendered personal-note modal; no clipping or overflow observed. E2E runtime error collectors passed.
- Dependencies: installed the existing lockfile via npm ci; no dependency versions changed.
- Delivery: merge requested on 2026-10-07. Remote main still matches the implementation base; tests, renderer E2E, and production build were rerun successfully before preparing the merge.
- Pending: none.
