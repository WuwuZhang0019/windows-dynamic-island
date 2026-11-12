# Complete branches and display-only stations

Date: 2026-11-12

Status: implemented and browser-verified; production runtime rebuilt and restarted; native interaction unverified

Task cards no longer offer branch expansion or collapse. Detailed cards keep the complete graph with station labels and status text. Compact rows keep the same full graph as points and lines, including every branch and join. Removing the arrow also releases its thumbnail space. Previously saved group-collapse values are ignored for rendering and remain preserved in service preferences.

Station markers are display-only spans with accessible labels and retained current-station styling. They do not receive keyboard focus or mouse selection. The original click handler and callback bindings remain commented in `src/workbench/GroupRouteGraph.tsx`, together with the restoration instructions. Card selection, sorting, archiving, size transitions and wheel navigation remain available.

Validation: frontend lint/build and 50 Bun tests; Rust clippy and 34 library tests. The grouping regression also checks that saved collapse values cannot hide stations. Browser checks pass for dynamic and Windows appearances: all 32 fixture stations appear in both sizes; branch arrows and station buttons are absent; marker clicks leave selection unchanged; compact graphs have no text; repeated size changes and keyboard reordering preserve complete graphs. Browser page errors: zero. The compact fixture card height is 70 px versus 334 px in detailed mode.

Evidence: `G:/rust/Codex-task-monitoring/app/test-results/static-branches-20261112/browser-check.mjs`, `browser-verification.json` and the four size/appearance screenshots in that directory. Native interaction has not been reverified; the earlier Computer Use application-access request timed out.

The production build uses `bun run app:build:runtime` and runs from `G:/rust/windows-dynamic-island/src-tauri/target/release/dynamic-island.exe`. Startup metadata is saved to `runtime-verification.json` in the evidence directory. A live process alone does not establish native interaction acceptance. The previous wheel-navigation browser regression also passes against this build.
