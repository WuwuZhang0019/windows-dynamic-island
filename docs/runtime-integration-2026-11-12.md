# Runtime integration repair

Date: 2026-11-12

Status: production runtime verified and restarted (2026-11-12)

The detail-sidebar cleanup branch was built from 94a2d95 without the compact-route fixes. Its runtime therefore displayed the old project/status summary. Merge 455e0cd into the shell branch while preserving 5664dde: no detail sidebar, complete single-route thumbnail, optional animated clock, shared green station palette, and a continuous border beam on running dots.

Validation: frontend lint and build, 35 Bun tests, Rust clippy and 29 Rust tests passed. Nine browser appearance regressions passed, including clock persistence, controls placement and all 60 long-route stations. The native release must be rebuilt from the merged source before replacing the old acceptance runtime. The installed F package is unchanged.

## Production runtime correction

Date: 2026-11-12

The first replacement runtime was incorrectly built with plain `cargo build --release`. In Tauri, optimization level alone does not select production mode: `tauri/custom-protocol` must be enabled. Without it the window loads `build.devUrl` (`http://localhost:1420`) and fails with ERR_CONNECTION_REFUSED when Vite is absent. The previous process-start check did not establish that the interface loaded.

Use `bun run app:build:runtime` (or `npm run app:build:runtime` with Bun available for the configured frontend hook). This runs the Tauri CLI with `--no-bundle` and the local configuration, embeds the frontend, and produces the standalone executable without creating an installer. Do not ship or launch plain Cargo release output as a standalone desktop build. Native production verification must load the embedded page with the Vite port closed and confirm real route dots, not merely a live process or a separate browser fixture.


Native verification result (2026-11-12): with port 1420 closed, the real WebView loaded `http://tauri.localhost/`, rendered one route with seven station dots and the clock, and opened the settings navigation without ERR_CONNECTION_REFUSED. Evidence: `G:/rust/Codex-task-monitoring/app/test-results/production-runtime/native-verification.json`, `native-thumbnail.png` and `native-settings.png`. The corrected executable was copied back to `test-results/merged-thumbnail/runtime/dynamic-island.exe` and restarted without the temporary WebView debugging argument. SHA-256: `10A264F8DDF2AD86C254DFA9E4D91C25BF84C03DB296CCEFBD8E5D94DBA6317C`. Frontend lint/build, Rust clippy and 29 Rust tests passed.
