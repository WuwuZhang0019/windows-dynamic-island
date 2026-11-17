# Adaptive workbench height

Date: 2026-11-17
Status: Implemented and verified; preparing the runtime update

The expanded island measures the currently viewed task and its surrounding controls. Tall routes grow the lower boundary, simple tasks shrink it, and the top anchor stays fixed. The original side-wheel vertical scrolling and route horizontal scrolling remain available. When switching tasks by scrolling, the selected reading anchor is preserved. Compact lists use their natural list height.

The native transparent window now spans the current monitor work area instead of a fixed 640 logical pixels. The visible shell is capped below that work area with a shadow margin. Height uses a bounded 320 ms transition so growth cannot spring beyond the available screen.

Frontend lint and build passed; 108 frontend tests and 41 Rust library tests passed, with Clippy and formatting checks clean. Fourteen browser checks cover both looks, actual project readonly content, compact/large display, simple and tall tasks, task switching, monitor-height changes, side-wheel scrolling and stable settled heights. Growth was also sampled frame by frame for overshoot. In a 1200 px browser viewport, the project panel measured 704 px and the simple task 303 px in the Windows look. Browser results do not establish native multi-monitor or DPI interaction acceptance.

The current runtime uses G:/rust/windows-dynamic-island/src-tauri/target/release/dynamic-island.exe. Updating it will preserve the existing backend process and its business data. Runtime deployment evidence is recorded after the build and restart.
