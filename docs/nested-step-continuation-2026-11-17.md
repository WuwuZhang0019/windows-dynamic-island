# Nested work package phases

Date: 2026-11-17
Status: Implemented and verified; preparing the installed runtime update

The route graph now expands all registered descendants while retaining explicit ownership by other routes. Existing work package IDs remain stable; nested technical, isolated acceptance and on-site phases can be displayed separately without marking their parent complete. The matching backend restricts selected continuation to its original subtree and open executions, preserving unrelated bindings.

The shell includes the existing lifecycle recovery work and dynamic route implementation. Frontend lint and build passed, all 75 explicit frontend source tests passed, and Clippy plus 40 Rust library tests passed. Eight browser checks passed, including a read-only PDSD snapshot showing all 27 registered nodes and responsive layouts.

Canonical contract source: Codex-task-monitoring commit bc1ad029a561098808109e18132562b8f5c33f35. Protocol provenance is recorded in src/workbench/contract/source.json.
