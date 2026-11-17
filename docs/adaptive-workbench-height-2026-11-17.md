# Adaptive workbench height

Date: 2026-11-17
Status: Implemented, verified and deployed locally

The expanded island measures the currently viewed task and its surrounding controls. Tall routes grow the lower boundary, simple tasks shrink it, and the top anchor stays fixed. The original side-wheel vertical scrolling and route horizontal scrolling remain available. When switching tasks by scrolling, the selected reading anchor is preserved. Compact lists use their natural list height.

The native transparent window now spans the current monitor work area instead of a fixed 640 logical pixels. The visible shell is capped below that work area with a shadow margin. Height uses a bounded 320 ms transition so growth cannot spring beyond the available screen.

Frontend lint and build passed; 108 frontend tests and 41 Rust library tests passed, with Clippy and formatting checks clean. Fourteen browser checks cover both looks, actual project readonly content, compact/large display, simple and tall tasks, task switching, monitor-height changes, side-wheel scrolling and stable settled heights. Growth was also sampled frame by frame for overshoot. In a 1200 px browser viewport, the project panel measured 704 px and the simple task 303 px in the Windows look. Browser results do not establish native multi-monitor or DPI interaction acceptance.

Implementation commits: d8809ba and 222b34e. The updated native runtime is G:/rust/windows-dynamic-island/src-tauri/target/release/dynamic-island.exe; F:/任务岛/dynamic-island.exe was synchronized to the same executable. Both have SHA-256 caa8183dd5069ec2d4aae4713ee9111d3717c506aef7313a11a1b3abd14deebf. The existing backend process (PID 23640) remained running throughout the frontend build and replacement. Business state and original identities were preserved: 7 projects, 112 steps and 89 executions matched the pre-update snapshot. A private local recovery copy contains the previous executables and business snapshots.

The new native process, collapsed island and settings window were observed running. The automation tool rejected an expanded-island click because it could not target the transparent floating window; no click was delivered to the underlying application. Native expanded interaction, monitor switching and DPI switching are therefore not recorded as interactively accepted.

The cross-repository browser regression script is app/tests/island-adaptive-height.mjs in G:/rust/Codex-task-monitoring. After building this shell's frontend, run it from that repository's app directory with ISLAND_SHELL_ROOT pointing here and ISLAND_HEIGHT_SNAPSHOT pointing to a readonly get_project JSON snapshot. It uses an isolated browser bridge and in-memory fixtures, without writing production business data. Archived browser results, deployment proof and a readonly display screenshot are in that repository's docs/03_轻量路线工作台/06_执行记录/assets/adaptive-height-20261117 directory.
