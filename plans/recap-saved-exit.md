# Recap saved snapshot exit

## Goal

Let users leave a read-only saved Recap without navigating away from Recap, while restoring the draft context they were viewing before opening the snapshot.

## Decisions

- Keep saved reports read-only; the disabled controls correctly communicate snapshot mode.
- Add an explicit `Back to current draft` action beside `Duplicate as draft`.
- Preserve the originating period and interval when a saved report is opened from the Brag doc.
- A deep-linked saved report without an originating context returns to the draft for that saved interval.
- Duplicating a saved report intentionally stays on the saved interval and must not restore the earlier context.

## Work

- [x] Add saved-view return-state handling to `useRecapWorkspace`.
- [x] Add the visible exit action to `RecapView`.
- [x] Cover return, deep-link, and duplicate behavior with tests.
- [x] Extend renderer E2E with the saved-to-draft flow.

## Verification

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run e2e:renderer`
- [x] Light/dark desktop and compact visual inspection
