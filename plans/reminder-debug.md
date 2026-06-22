# Reminder Debug

## Goal

Find why the reminder feature is not firing and fix the root cause, including notification permissions if needed.

## Current Notes

- Reminder scheduling flows from `src/App.tsx` through the preload bridge to `electron/reminders.ts`.
- The scheduler previously cleared the active timer before checking whether the payload was for the real current week; browsing another week could cancel the real reminder.
- Electron native notification failures were silent. On macOS, Electron documents that native notifications require a signed app to appear, and failures emit `failed`.
- Keep Jira behavior untouched.

## Pending Work

- None.

## Verification

- `npm run test -- electron/reminders.test.ts` passes.
- `npm run test` passes.
- `npm run build` passes.
- Renderer smoke checked in the in-app browser at `http://127.0.0.1:5173/?demo=1&view=settings&theme=dark&seed=release&today=2026-06-17`: page rendered, no fresh console errors/warnings after reload, reminder switch toggled from on to off, reminder time field remained present.
