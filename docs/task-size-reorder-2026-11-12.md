# Task list size and local ordering

Date: 2026-11-12

Status: implemented and verified in the native production runtime

Settings -> Modules contains one setting, Task display size. Large is the default and retains the full route card. Small renders a compact row with title/context, status and completion count, while the selected route still drives the compact thumbnail. The upstream ModulesPage handle-only Reorder interaction is reused in the route list.

Each row/card has a six-dot handle. Pointer dragging changes local presentation order; the handle also supports standard up/down keyboard movement. Card clicks and stage clicks keep their existing selection behavior. Dragging writes the order once at release. The service's project, route and stage ordering is unchanged. New routes append after saved routes, and absent keys cannot fabricate items. Unavailable route keys remain in preferences so returning routes recover their prior placement.

Native and browser settings allowlists retain tasks.displaySize and tasks.routeOrder. Settings changes broadcast across the native settings and island windows. Only task presentation preferences are added; previous module/plugin settings remain outside the retained configuration.

Validation: frontend lint/build, 40 frontend tests, Rust clippy and 30 Rust tests passed. Browser pointer tests verified compact rows (45.5 CSS px) and large cards (160 CSS px), handle dragging in both sizes, preserved route selection, reload persistence and compact thumbnail selection. Evidence: G:/rust/Codex-task-monitoring/app/test-results/task-size-reorder/browser-verification.json.

Native verification (2026-11-12): the Modules page contained one setting, changes immediately reached the separate island window, compact rows measured about 44 CSS px and full cards about 155 CSS px. Actual pointer dragging in both sizes and keyboard movement saved order, retained the selected route, and left the service route sequence unchanged. A handle drag holds an unpinned island open until release; a browser edge-drag regression verified both retention and release. Evidence: G:/rust/Codex-task-monitoring/app/test-results/task-size-reorder/native-verification.json and drag-hold-verification.json.


Restart verification (2026-11-12): the pre-restart order was checked against the on-disk JSON, then the process was stopped and relaunched. Both size and order matched after restart. Final-build pointer dragging passed. Test changes were restored to the original large display and source task order, with rendered order checked against the service snapshot. Native process-restart evidence is included in native-verification.json.
