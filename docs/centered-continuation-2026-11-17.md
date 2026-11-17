# Centered many-to-one continuation

Date: 2026-11-17
Status: Implemented, verified and deployed locally

When two or more preceding route rows all converge into a single later row, the continuation is rendered at their vertical midpoint. The preceding rows remain ordered and evenly spaced. Even row counts place the continuation halfway between the middle two rows. Unused height from the former main row is removed. This applies to both full cards and compact diagrams.

The adjustment is restricted to a continuation whose first column follows every station in the preceding rows and receives an incoming visible edge from each row. Overlapping route rows and unrelated sequential fragments keep their existing placement. Station IDs, ownership rows, columns, dependencies and colours remain unchanged; edge paths are calculated from the adjusted display coordinates.

Validation: frontend lint/build, 118 frontend tests, Clippy and 41 Rust library tests passed. Ten new geometry tests cover 2-5 incoming rows in both sizes, midpoint placement, graph height, endpoint continuity, station uniqueness, input immutability and excluded structures. Eight isolated browser cases render the screenshot's actual readonly plan at desktop/mobile widths, both looks and both sizes. E/F/I/J share the midpoint between A/C/G, all ten stations remain present and SVG paths meet their station centres. This is browser evidence rather than native desktop interaction acceptance.

Browser script and evidence are in G:/rust/Codex-task-monitoring/app/tests/island-centered-continuation.mjs and docs/03_轻量路线工作台/06_执行记录/assets/centered-continuation-20261117. The existing dynamic-height and side-wheel browser regression is also rerun for this change.

The native release was built and switched locally. The running executable and F:/任务岛/dynamic-island.exe share SHA-256 53b44a14207a2aca9b102bf504032efb57276808e79f42707fc92b85d48e18a5. Backend PID 23640 remained running; all 7 projects, 112 steps, 89 executions and business state matched the pre-update snapshot. Prior executables and the snapshot were backed up. The existing height/wheel browser regression passed all 24 checks.
