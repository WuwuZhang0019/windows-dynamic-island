# Task card defaults and wheel navigation

Date: 2026-11-12

Status: implemented and browser-verified; production runtime rebuilt and restarted; native interaction unverified

Task cards now default to the minimal ink lift when the preference is missing or invalid. Both the Behavior selector and task cards use this default. Explicitly saved emerald or minimal choices remain effective.

In the expanded detailed list, rolling the wheel over a card, including its title and blank space, moves an overflowing route horizontally. The list gutters retain native vertical scrolling. Routes consume wheel events at either horizontal end so continued scrolling cannot unexpectedly move the outer list. Routes that fit their card and compact cards retain normal list scrolling. The native non-passive listener handles pixel, line and page deltas, preserves horizontal trackpad input, and leaves Ctrl-wheel zoom untouched.

Both the outer list scrollbar and inner route scrollbars are hidden with standard and WebKit CSS. Their overflow containers remain scrollable, without a reserved scrollbar gutter.

Validation: frontend lint/build and 50 Bun tests; Rust clippy and 34 library tests. Isolated Edge checks pass in both dynamic and Windows appearances: default and saved effects agree with the selector; both scrollbar styles are hidden; positive and negative wheel input moves the route; card titles use the same horizontal behavior; both route ends prevent vertical chaining; gutters scroll vertically; line deltas normalize; Ctrl-wheel is preserved; compact mode remains available. Browser page errors: zero.

Evidence: `G:/rust/Codex-task-monitoring/app/test-results/card-wheel-20261112/browser-check.mjs`, `browser-verification.json`, `dynamic-hidden-scrollbars.png` and `windows-hidden-scrollbars.png`.

Native UI inspection could not proceed because Computer Use application-access approval timed out. Browser checks do not establish native interaction acceptance.

The production runtime was built with `bun run app:build:runtime` and restarted from `G:/rust/windows-dynamic-island/src-tauri/target/release/dynamic-island.exe`, replacing only this fork's debug process. A live process confirms startup only. The original `F:/Dynamic Island/dynamic-island.exe` remains running. Runtime metadata: `G:/rust/Codex-task-monitoring/app/test-results/card-wheel-20261112/runtime-verification.json`.
