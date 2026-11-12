# Animated route list

Date: 2026-11-12

Status: implemented and verified in the native production runtime

Reference: [Magic UI Animated List](https://magicui.design/docs/components/animated-list). The presentation follows its staggered card entrance using the existing Motion dependency.

Each list item contains one complete route with its title, project/plan context, stage completion count and existing point-and-line diagram. Projects and plans retain source order; routes use their declared order. The original stage selection, status colors, running-dot border beam, branch references and compact thumbnail continue to use the service snapshot. Empty projects and plans retain an explicit empty state.

Stable entity keys keep cards mounted across service refreshes. All items mount immediately for scrolling and keyboard access. Initial entrance uses a 70 ms stagger capped at 350 ms, a small upward movement and scale, plus opacity. Layout changes animate position; reduced-motion preferences disable card movement and entry delays. Reading selection and vertical/horizontal scroll remain in the existing preference store.

Validation: frontend lint/build, 35 existing frontend tests and Rust clippy/29 tests passed. Browser verification covered staggered entrance, one card per route, all 60 stations in a long route, horizontal access to its last station, empty snapshots and absence of page errors. Evidence: G:/rust/Codex-task-monitoring/app/test-results/animated-route-list/browser-verification.json.

Native verification (2026-11-12): the embedded page rendered all seven routes and 27 stations from the real service in declared order. Frame samples confirmed staggered entrance. Across an explicit refresh and the automatic polling interval, card DOM identities, selected stage and scroll position stayed stable, with no repeated fade-in. Reduced-motion cards appeared immediately, and the seven-dot compact route remained intact. Native evidence: G:/rust/Codex-task-monitoring/app/test-results/animated-route-list/native-verification.json and native-expanded.png.
