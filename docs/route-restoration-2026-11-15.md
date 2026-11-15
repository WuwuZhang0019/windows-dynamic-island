# Roadmap delivery reconciliation

Date: 2026-11-15

Status: Integrated and validated; production restart evidence is stored in the business repository's ignored test-results directory.

## Cause

The five roadmap corrections ending at `467c503` existed only on `codex/vertical-fork-origin`. Temporary production builds from that checkout made the corrections visible, but the delivery branch `codex/island-workbench-shell` did not contain them. A later production build from delivery commit `179c251` consequently restored the older rendering rules. This was a missed integration, rather than a cache or task-data problem.

## Reconciliation

Merge both histories before advancing the delivery branch. Preserve vertical fork origins, same-parent child routes without a spurious return edge, level parent routes, simplified transitive dependency drawing with prerequisite tooltips, merge stations at their junctions, and caption clearance. Also preserve the newer action button layout, archive icon fix and compact terminal alignment.

The coordinate conflict is resolved per display mode: full diagrams keep junction placement; compact diagrams keep terminal stations at the fixed right edge and apply junction placement to internal merges using the compact column stride. Dependencies remain unchanged in the service.

Frontend unit tests are now included in the existing CI workflow, including the combined compact-alignment and merge-junction assertions. The production build must be made from the integrated delivery checkout, with its commit and executable hash recorded alongside the restart result.

## Validation

- Frontend lint and production frontend build passed.
- All 71 frontend tests and 39 backend library tests passed; Clippy passed with warnings denied.
- Browser checks cover both appearances, three viewport widths, line endpoint alignment, compact switching and collapsed selection synchronization.
- The production restart records the actual delivery commit, executable SHA-256, process ID and authenticated service health in `G:/rust/Codex-task-monitoring/app/test-results/route-restoration-20261115/`.

The original task data and running background service are retained. Native screenshots were not used as evidence for the browser checks.
