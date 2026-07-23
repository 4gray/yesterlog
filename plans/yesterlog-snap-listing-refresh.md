# Yesterlog Snap listing refresh

## Goal

Publish the completed Yesterlog rebrand to the `yesterlog` Snap Store listing,
including current metadata, links, screenshots, icon, and featured banner from
the remote `main` branch.

## Decisions

- Treat `origin/main` as the requested master/default branch; no `master`
  branch exists.
- Use the canonical copy and media recorded in
  `docs/snap-store-listing.md`.
- Upload only assets from the Yesterlog 3.0.0 repository state.
- Verify the saved dashboard values and the public Store page.

## Work

- [x] Audit canonical listing copy, links, and media from `origin/main`.
- [x] Update listing metadata and links.
- [x] Replace screenshots, icon, and featured banner.
- [x] Save and verify the public `yesterlog` listing.

## Verification

- Snapcraft reported `Changes applied successfully`.
- A full dashboard reload retained both categories, the full description,
  privacy link, icon, five screenshots, and featured banner.
- Dashboard media dimensions: icon 512×512, screenshots 1440×1000, featured
  banner 2160×720.
- The public page shows Yesterlog 3.0.0, MIT license, both categories, all links,
  the full description, and the five release screenshots.
