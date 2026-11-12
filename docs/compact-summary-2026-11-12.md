# Compact summary follow-up

Date: 2026-11-12

Status: implemented; user acceptance pending

The collapsed workbench shows the live local clock and one complete horizontal point-and-line route. There are no visible project names, mode badges, counts, station codes, or status text. Station descriptions remain available through hover tooltips and assistive technology.

The route follows the valid selection from the expanded panel; otherwise it follows the current running, blocked, or pending step. An unlisted child follows its closest ancestor's route. Only that route's stations are rendered, in their original order, without merging other routes or appending unassigned stages. The previous all-routes thumbnail is superseded by the user's single-route correction.

Palette update date: 2026-11-12. Per the user's explicit revision, station styling is shared with the expanded view: completed is a solid green circle, running is a hollow green circle, blocked is amber, pending is gray and hollow, and cancelled uses a gray dashed outline with reduced opacity. Green is exactly rgb(0, 194, 106), or #00C26A. Completed connections are solid green; a connection leading to a running station is dashed green; other connections retain gray. Each connection uses its destination station's state. Both halves in the expanded view and the full segment in the thumbnail share that rule, with no leading or trailing segment. Long routes scale their dots to keep the first and last station visible; empty snapshots do not fabricate a route.

The single-route selection and 60-station regressions remain in place. Palette verification additionally checks the exact green RGB, solid/hollow station shapes, solid/dashed/gray connections, and agreement between expanded and compact segments. Verification output is stored under G:/rust/Codex-task-monitoring/app/test-results/route-palette. Browser fixtures are isolated simulations, not native service acceptance.

Final palette checks passed on the committed appearance baseline 8ac91e2 plus this scoped overlay: lint, frontend build, 35 Bun tests, Rust clippy with warnings denied, and 29 Rust tests. Browser checks covered the default three-station route, expanded view, selected four-station route, and all 60 stations in a long route, including computed RGB, hollow fill, segment color/style and clipping bounds. The previously concurrent clock-toggle and controls-position fixes are now part of the committed baseline, not additional changes in this palette commit.

Unrelated concurrent appearance-setting edits are preserved and excluded from this palette commit. The palette acceptance build uses a separate source export containing only the base commit and this scoped change; only the previously launched acceptance executable is stopped before starting the new one. The pinned F installer and corresponding source packages are unchanged. User acceptance remains pending.
