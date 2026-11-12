# Runtime integration repair

Date: 2026-11-12

Status: verified source; native runtime verification pending

The detail-sidebar cleanup branch was built from 94a2d95 without the compact-route fixes. Its runtime therefore displayed the old project/status summary. Merge 455e0cd into the shell branch while preserving 5664dde: no detail sidebar, complete single-route thumbnail, optional animated clock, shared green station palette, and a continuous border beam on running dots.

Validation: frontend lint and build, 35 Bun tests, Rust clippy and 29 Rust tests passed. Nine browser appearance regressions passed, including clock persistence, controls placement and all 60 long-route stations. The native release must be rebuilt from the merged source before replacing the old acceptance runtime. The installed F package is unchanged.