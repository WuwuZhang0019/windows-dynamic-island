# Compact summary follow-up

Date: 2026-11-12

Status: implemented; user acceptance pending

The collapsed workbench now always shows the live local clock for both shell styles. A second row renders the active route as connected status-colored stops, with the current step outlined and an accessible textual route description. Project and connection/status summaries remain on the first row. Empty snapshots do not fabricate a route.

Validation: frontend lint/build, 24 Bun tests, Rust clippy with warnings denied, and 28 Rust library tests passed. A browser simulation verified the clock, three route stops, accessible labels, and no horizontal overflow at the compact width; screenshot and raw output are under G:/rust/Codex-task-monitoring/app/test-results/summary-panel. The preview is simulation evidence, not a native service acceptance result. Initial unused-parameter and ARIA lint errors were corrected.

This follow-up uses a separate native build directory and does not replace the pinned F release installer or its corresponding source packages. User acceptance remains pending.
