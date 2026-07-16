# Active Work Dock Ticket Links

## Goal

Make each dock ticket key open the existing read-only ticket-details dialog and
show the adjacent external Jira link, without changing card drag/drop or Today
card activation.

## Decisions

- Reuse `TicketKeyLink` so the dock follows the same popup and browser-link
  behavior as other card views.
- Keep the card itself as the drag/select surface.
- Stop mouse-down, click, and keyboard events at the nested ticket controls so
  they cannot arm a dock drag or activate Today's log-time action.
- Preserve the dock's existing issue-type badge, status, epic/project, and
  metadata layout.

## Completed Work

- Reused the shared ticket controls in `ActiveWorkDock`.
- Hardened `TicketKeyLink` against mouse-down and keyboard bubbling and disabled
  native link dragging.
- Added regression coverage for details, external links, drag arming, and Today
  card keyboard activation.
- Verified Week and Today in the demo renderer, including a real dock-card drag
  into the quick-log sheet.

## Verification

- Focused dock/link/drag tests: 3 files, 8 tests passed.
- Full `npm run test`: 105 files, 656 tests passed.
- `npm run e2e:renderer`: 7 tests passed.
- `npm run build`: passed.
- Rendered at 1440×1000 in Week and Today: no clipping or page errors; key opens
  the details dialog, the Jira icon remains an external link, Today card click
  still opens Add Time, and Week drag/drop still opens quick log.
