# Grouped task routes

Date: 2026-11-12

Status: implemented and browser-verified; production runtime rebuilt; native UI inspection blocked by an application-access approval timeout

The task list now groups a plan's routes into one card. Plans with explicit branch source, return or linked-supplement relationships share their parent task's card; unrelated plans remain separate, including plans in the same project. Stable plan identities preserve group order when routes refresh or individual entries are archived. Existing route-order preferences migrate through member aliases.

Both compact and detailed cards render a single graph. Shared stations appear once, declared sources and returns connect to their actual stations, and dependency order determines horizontal columns. Finished branch spans release lanes for later forks. Sequential route fragments remain on one lane. Missing joins are never inferred. Compact graphs contain points and lines without branch-count text. The chevron folds a task to its main route and restores its branches; reading preferences retain this choice. Detailed graphs retain horizontal scrolling and station selection. The panel owns vertical scrolling and keeps its existing height limit.

Dragging or keyboard reordering moves the complete task group. The group's archive action uses the existing owner archive operation for each visible member, with a fresh revision between operations; an error leaves the unconfirmed remainder visible and reports partial progress. The service schema and execution states are unchanged.

Validation: frontend lint/build and 50 frontend tests; Rust clippy and 34 library tests. Graph regressions cover related and unrelated plans, legacy ordering, archive filtering, repeated forks and lane reuse, sequential fragments, shared stations, absent joins, cyclic data and destination-state connections. Browser checks cover compact height changes, branch folding, station selection, whole-group ordering, both card sizes and horizontal access to all 60 stations. Evidence: `G:/rust/Codex-task-monitoring/app/test-results/grouped-task-routes/browser-verification.json`.
