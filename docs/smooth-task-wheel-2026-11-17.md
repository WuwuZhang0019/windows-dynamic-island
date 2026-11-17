# Smooth task wheel navigation

Date: 2026-11-17
Status: Implemented, verified in isolated browsers and deployed locally

In the expanded full-card view, each wheel event in the side gutter advances one task in its direction. A 380 ms ease-out scroll runs alongside the existing shell-height transition. The target task remains fixed during this animation so height measurement cannot snap the list to a different visible card. New input retargets from the current position, including rapid reversal. The first and last tasks remain stable boundaries.

The panel-level listener covers the right padding as well as the list gutter. Wheel input inside cards remains with the existing graph handling. Compact lists, Ctrl-wheel zoom and single tall task scrolling retain their existing handling. Reduced-motion navigation waits for height settlement before releasing its reading anchor. Pending frames and listeners are removed when the expanded view unmounts.

Validation: frontend lint and build, 108 frontend tests, Clippy and 41 Rust library tests passed. The cross-repository browser test at G:/rust/Codex-task-monitoring/app/tests/island-adaptive-height.mjs passed 24 checks across both looks. It exercises intermediate animation positions, exactly one task per detent across three tasks, reversal, boundaries, reduced motion, graph horizontal scrolling, height changes and screen caps. Use bun test ./src to limit frontend tests to that directory; the bare src filter also matches packaged tests inside src-tauri/target.

Browser evidence is archived under docs/03_轻量路线工作台/06_执行记录/assets/smooth-wheel-20261117 in the monitoring repository. Browser validation does not establish native desktop wheel-interaction acceptance.

The native release was built and switched locally. The running release executable and F:/任务岛/dynamic-island.exe share SHA-256 dbbbcd80e108cb16516f546feac73fd01981c7e4fd4249ede6c439a0de5d6ad2. The original backend process (PID 23640) remained running; all 7 projects, 112 steps, 89 executions and business state matched the pre-update snapshot. The previous executables and business snapshot were backed up locally.
