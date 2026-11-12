# Compact summary follow-up

Date: 2026-11-12

Status: implemented; user acceptance pending

The collapsed workbench shows only the live local clock and a text-free route thumbnail. Every route in the active plan is displayed, with each station included once; unassigned stages are also retained in an extra lane. Status colors and the current-step outline remain, while names, mode badges, counts, and station text are removed. Full descriptions remain accessible to assistive technology and hover tooltips. Empty snapshots do not fabricate a route.

Validation: frontend lint/build, 24 Bun tests, Rust clippy with warnings denied, and 28 Rust library tests passed. A browser simulation verified no visible summary text, all 21 plan stations (six routes plus one unassigned child lane), 21 visible station bounds, the clock, accessible labels, full-width tracks, and no horizontal overflow at the compact width; screenshot and raw output are under G:/rust/Codex-task-monitoring/app/test-results/summary-panel. The preview is simulation evidence, not a native service acceptance result. Initial unused-parameter and ARIA lint errors were corrected.

This follow-up uses a separate native build directory and does not replace the pinned F release installer or its corresponding source packages. User acceptance remains pending.

Follow-up date: 2026-11-12. Initial browser strict-mode selection was corrected for multiple lanes. Visual review caught and fixed inherited centered alignment so tracks fill the available width. The first native rebuild encountered a locked executable from the earlier acceptance run; only that exact instance is stopped before rebuilding.
