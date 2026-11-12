# Compact summary follow-up

Date: 2026-11-12

Status: implemented; user acceptance pending

The collapsed workbench shows the live local clock and one complete horizontal point-and-line route. There are no visible project names, mode badges, counts, station codes, or status text. Station descriptions remain available through hover tooltips and assistive technology.

The route follows the valid selection from the expanded panel; otherwise it follows the current running, blocked, or pending step. An unlisted child follows its closest ancestor's route. Only that route's stations are rendered, in their original order, without merging other routes or appending unassigned stages. The previous all-routes thumbnail is superseded by the user's single-route correction.

Station styling is shared with the expanded view: completed is pink, running is green, blocked is amber, pending is hollow, and cancelled uses a dashed outline with reduced opacity. A thin connected line and the selected station outline remain. Long routes scale their dots to keep the first and last station visible; empty snapshots do not fabricate a route.

Validation: frontend lint/build, 29 Bun tests (including five thumbnail regressions), Rust clippy with warnings denied, and 28 Rust library tests passed. Browser simulation verified exactly one track, no visible text, correct shared state colors, a visible clock, no horizontal overflow, and every station inside the thumbnail for a default three-stop route, an expanded-panel selection with four stops, and a 60-stop route. Screenshots and browser/build output are under G:/rust/Codex-task-monitoring/app/test-results/summary-panel/single-route-*. The browser preview is simulation evidence, not native service acceptance.

The native acceptance executable is rebuilt in the dedicated summary-panel/target directory; only the previously launched executable at that exact path is stopped before replacing it. The pinned F installer and corresponding source packages are unchanged. User acceptance remains pending.
