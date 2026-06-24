# Day Column Scroll

Goal: keep week day headers visible while only the ticket/note area scrolls when a day has more events than fit in a small window.

Decisions:
- Preserve the existing week layout and design tokens.
- Add overflow behavior only to the event list area so headers remain fixed inside each day column.
- Show scrollbars only when the content overflows.

Pending work:
- None.

Verification:
- `npx vitest run src/components/WeekView.test.tsx` passed.
- `npm run build` passed.
- Rendered QA passed on `http://127.0.0.1:5173/?demo=1&view=week&theme=dark&today=2026-06-17` at `1180x520` with the active work dock open: `.day-logs` used `overflow-y: auto`, `scrollTop` changed from `0` to `216`, the day header stayed fixed at `top=125`, and `window.scrollY` stayed `0`.
- Full `npm run test` was attempted and still fails in `src/components/SettingsView.test.tsx` on unrelated settings-tab expectations.
