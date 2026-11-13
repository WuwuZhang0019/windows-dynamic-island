# React Git Log roadmap adaptation

Date: 2026-11-13
Status: Implemented; validation is recorded in the task-monitoring delivery note.

Upstream: https://github.com/TomPlum/react-git-log
Author: Thomas Plumpton (TomPlum)
Pinned commit: `1b9eb87f25917f435335f665e0b082a7fa99a096`
License: Apache-2.0, reproduced in `LICENSE` and the distributed `THIRD-PARTY-NOTICES.txt`.

The full repository was downloaded into the companion task-monitoring worktree's ignored `.upstream/react-git-log` directory. Only the two relevant original renderer files are retained here as reviewable source snapshots; their exact paths and SHA-256 checksums are in `upstream.json`. These snapshots are reference material, not compiled runtime modules.

## Modified runtime source

- `src/workbench/git-roadmap/CurvedEdge.tsx` adapts the upstream Grid `CurvedEdge`: it keeps the SVG path, stroke, dash and non-scaling-stroke rendering, moves the SVG viewport to the shared graph, and adds task edge metadata. The SCSS and Git context dependencies are removed.
- `src/workbench/git-roadmap/geometry.ts` adapts the line/quadratic-curve strategy in `CanvasRenderer.drawEdgeBetweenNodes` to horizontal SVG paths with two rounded corners. Forks leave the source vertically and turn onto the child lane; joins turn near the target. Downward fork source labels leave a clear corridor on their right. Long same-lane dependencies bypass intermediate stations. This is a local routing adaptation, not the incomplete upstream Canvas renderer.
- `GroupRouteGraph.tsx` renders the existing declared task DAG with these primitives. Route colour is stable by route key; station fill, label and line pattern retain task status. A join has one station with an inner ring. Expanded diagrams identify branches; compact diagrams remain text-free.

The upstream Git history sorter, synthetic index commits, timestamps, authors, table, remote URLs, pagination, placeholder commits and Storybook application are deliberately excluded. No fabricated commits, timestamps or Git branches are inserted into task data. The existing task layout owns dependency ordering, shared-node centering, lane reuse and malformed-cycle handling.

Card selection, paused station actions, wheel scrolling, ordering, archival, application filtering and collapsed island synchronization remain owned by the host workbench. There is no new runtime dependency or backend protocol change.
