# Task lifecycle recovery

日期：2026-11-16
Status: Implemented and verified with an isolated native application

The native shell now watches its existing standalone service and wakes it through the bundled service entry after an outage. Initial startup registers the current executable, PID and data directory in the private launcher record consumed by workbench plugin 0.1.26. A single-instance `--workbench-recover` launch wakes the watchdog without opening settings. No developer path or second data root is used at runtime.

Normal application exit and native island close requests query the authenticated owner for committed task activity. Open executions, running steps and draining continuous runs prevent exit. Unavailable state also fails closed while connection recovery proceeds. The reminder is an owned, topmost modal dialog; confirming it leaves the task running. An idle application can exit normally. Task Manager termination cannot be intercepted: the native watchdog recovers a killed owner, while an active plugin connection or its next tool call can recover both processes.

The backend and plugin changes live in the paired `Codex-task-monitoring` worktree on `codex/task-island-recovery`. They persist exact write requests, reconcile original event IDs and restore enabled continuous runs by attaching to their original turns. Explicit pause intent and unresolved delivery checkpoints are preserved. A new installation still needs its first connection authorization; fixed-endpoint legacy configurations do not opt into native startup.

Validation: frontend lint and build passed; Rust 1.98 library tests passed (40), and `cargo clippy -- -D warnings` passed. An isolated debug host with identifier `com.codextaskmonitor.recoverytest` verified the actual modal reminder, active-task protection, both crash recovery paths, and normal exit after cancellation. `ISLAND_NATIVE_TEST_SERVICE=1` only enables the bundled service inside the existing debug input-test host. Test data and launcher metadata were isolated, `.portable` disabled startup registration, and no real model was called.

The full evidence and commands are in the paired repository at `docs/03_轻量路线工作台/06_执行记录/task-island-recovery-20261116/`. This branch does not replace an installed application. Package it with the new backend resources before release.
