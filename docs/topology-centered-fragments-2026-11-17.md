# Centered temporal route fragments

Date: 2026-11-17
Status: Implemented, browser-verified and deployed locally

Declared routes without persistent independent tracks can describe successive pieces of one workflow. They no longer reserve a separate display row for their entire lifetime. The renderer orders these fragments by their column spans, centers joins between their incoming rows, and spreads fork children symmetrically around their shared source. Non-overlapping fragments can reuse the same vertical space. Occupied intervals retain one full row of separation.

The twenty-step, six-route example now uses two parallel display rows: A-01/A-02/A-03 and A-04/A-05/A-06 converge into centered A-07 through A-10; A-11 through A-13 and A-14 through A-16 reuse the original two rows; A-17 through A-20 converge back to the same center. Full graph height is 190 px instead of 566 px, and compact graph height is 42 px instead of 114 px.

Multiple explicit independent heading tracks retain their stable positions. Spanning routes whose connected fragments overlap horizontally also retain their established layout. A single heading does not force every later fragment onto a separate row. The adjustment affects display positions only; stored routes, station ownership, columns, identities, status, colours and dependencies remain intact. Curves and captions use the new display coordinates.

Validation: frontend lint/build and 127 frontend tests passed, including nine new cases for repeated joins/forks, 2-4 parallel branches, sequential fragments, occupied rows, single headings and independent tracks. Clippy and 41 Rust library tests passed. Eight browser checks use the actual twenty-step readonly plan in both looks, two viewport widths and both sizes; every join/fork midpoint, reused row and SVG station endpoint passed. The previous plan-03 centering checks (8) and height/side-wheel checks (24) also passed. Browser evidence does not establish native desktop interaction acceptance.

Cross-repository script: G:/rust/Codex-task-monitoring/app/tests/island-topology-centered.mjs. Evidence: docs/03_轻量路线工作台/06_执行记录/assets/topology-centered-20261117 in that repository. This extends the earlier centered-continuation change to intermediate joins and forks.

The native release was built and switched locally. The running release and F:/任务岛/dynamic-island.exe share SHA-256 b0d054cd304cebb0b3d07b98b2eeeabf41ddbff4119757ddd9d99f0853a50675. Original backend PID 23640 remained running; all 7 projects, 112 steps, 89 executions and business state matched the pre-update snapshot. Previous executables and the snapshot were backed up locally.
