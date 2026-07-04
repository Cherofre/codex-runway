## Current Snapshot

Last Updated: 2026-07-04

Goal: Port Codex Runway toward Windows in two stages: first a cross-platform CLI, then a Windows tray host that consumes the CLI.

Phase: Stage 2 implemented with a usable Windows tray popup, basic settings panel, opt-in notification alerts, right-click maintenance actions, and a portable Windows package; SwiftPM on Windows remains blocked by a toolchain-level `fatalError`.

Superpowers Phase: Verification / handoff.

Superpowers Plan: `docs/superpowers/plans/2026-07-01-windows-cli.md`.

Progress:
- Stage 1 source changes exist in the working tree: `CodexRunwayCLI`, `CodexRunwayCLIKit`, non-macOS package gating, and core portability shims.
- Stage 2 added a stable `CodexRunwayCLI --json` contract with DTOs and tests.
- Stage 2 added `WindowsTray/`, a lightweight Electron tray host that consumes CLI JSON.
- Windows Swift 6.3.2 and Visual Studio Build Tools are installed locally.
- Added `Scripts/Build-WindowsCLI.ps1`, a manual `swiftc` build path that emits `.build/windows-cli/CodexRunwayCLI.exe` while SwiftPM is blocked.
- Added tray smoke mode (`npm run smoke --prefix WindowsTray`) that starts Electron, calls the CLI once, and exits.
- Added a tray popup panel with quota meters, reset credit detail, API-equivalent detail, recent sessions, refresh, open-folder, and close-panel interactions.
- `resetCredits.credits[]` is now exposed in CLI JSON and the Windows detail view lists individual reset credits. Next expiry uses the earliest available credit with an expiry date.
- Window-level close controls now hide the panel only; full app quit remains in the tray context menu.
- Added Windows tray settings with local Electron userData persistence, refresh interval control, and homepage visibility toggles for quota, reset credits, API equivalent, and recent sessions.
- Added a UI smoke test mode that opens the Electron renderer, enters settings, changes refresh interval, toggles a homepage section, and verifies the DOM state.
- WindowsTray CLI resolution now prefers the manual `.build/windows-cli/CodexRunwayCLI.exe` before falling back to SwiftPM.
- WindowsTray now formats raw network failures such as `NSURLErrorDomain error -1001` into Chinese user-facing messages and retries one transient CLI status snapshot failure before showing the error.
- `CodexRunwayCLI --json` errors now include structured `code`, `rawMessage`, and `isRetryable` fields while preserving `area` and user-facing `message`.
- WindowsTray now has opt-in local notification alerts for quota thresholds and expiring reset credits, with Electron userData de-duplication.
- WindowsTray right-click menu now includes restart Codex, restart VSCode, and confirm-first session sync/repair actions adapted from the local PowerShell tray tool.
- Reset credit detail rows now place remaining time before the availability badge to avoid staggered right-side labels.
- WindowsTray right-click status summary and tooltip are localized to Chinese, including compact K/M token formatting.
- WindowsTray settings now include real open-at-login and automatic update-check toggles; update checks use GitHub Releases and are also available from the tray menu.
- WindowsTray popup now has clickable quota and recent-session entries with Chinese detail pages and back navigation.
- Added `Scripts\Package-WindowsTray.ps1`, which builds a dedicated package CLI, copies Electron, the tray app, app icon, bundled CLI, and Swift runtime DLLs into `.build\windows-tray-portable\Codex Runway`, and creates `.build\CodexRunway-Windows-Portable.zip`.
- WindowsTray detail pages now show information that is not present on the homepage: quota window cards and credit balance, reset credit full metadata, API exact window/explainer rows, and recent-session summary metrics with full IDs and exact timestamps.
- WindowsTray settings now include Windows-backed appearance selection, status JSON export to `~/.codex-runway/status.json`, test notification, status-folder opening, GitHub/feedback links, and about/runtime info.
- WindowsTray refresh errors now open a diagnostics/recovery detail page with immediate retry, safe diagnostic copy, Codex folder opening, and status JSON folder opening.

Verification Evidence:
- `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v` failed with `error: fatalError` after printing the `CodexRunwayCore` `swiftc` command and no Swift source diagnostics.
- The same Core compile path was verified earlier by direct `swiftc`; the committed workaround is now `Scripts\Build-WindowsCLI.ps1`.
- `powershell -ExecutionPolicy Bypass -File Scripts\Build-WindowsCLI.ps1` passed and built `.build/windows-cli/CodexRunwayCLI.exe`.
- `.build\windows-cli\CodexRunwayCLI.exe --help` passed.
- `CodexRunwayCLI.exe --json` passed against the local Codex auth/session data during smoke testing.
- `npm install --prefix WindowsTray` passed and generated `WindowsTray/package-lock.json`.
- `npm test --prefix WindowsTray` passed: 5 tests, 0 failures.
- `node --check WindowsTray/main.js` passed.
- `node --check WindowsTray/status.js` passed.
- `npm run smoke --prefix WindowsTray` passed with `CODEX_RUNWAY_CLI` pointing at `.build/windows-cli/CodexRunwayCLI.exe`.
- `git diff --check` passed; output only contained Windows CRLF conversion warnings.
- `npm run check --prefix WindowsTray` passed after the popup panel updates.
- `npm test --prefix WindowsTray` passed after the popup panel updates: 5 tests, 0 failures.
- The user manually inspected the persistent tray panel and reported UI issues that were fixed: clipped footer, rotating refresh button background, missing reset credit detail rows, and confusing quit/close semantics.
- `npm run check --prefix WindowsTray` passed after settings updates.
- `npm test --prefix WindowsTray` passed after settings updates: 8 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed with `tray ui smoke ok`; Electron also printed non-fatal GPU IPC noise.
- `npm run smoke --prefix WindowsTray` passed after adding `.build/windows-cli` CLI discovery.
- `npm run check --prefix WindowsTray` passed after network error handling updates.
- `npm test --prefix WindowsTray` passed after network error handling updates: 14 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after network error handling updates and asserts raw `NSURLErrorDomain` text does not leak into the renderer.
- `npm run smoke --prefix WindowsTray` passed after network error handling updates.
- `powershell -ExecutionPolicy Bypass -File Scripts\Build-WindowsCLI.ps1` passed after adding structured CLI error fields.
- A temporary Swift runtime check encoded `RunwayCLIStatusError(area: "quota", error: URLError(.timedOut))` as `code: "timeout"`, `isRetryable: true`, friendly `message`, and original `rawMessage`.
- `npm run check --prefix WindowsTray` passed after structured CLI error compatibility updates.
- `npm test --prefix WindowsTray` passed after structured CLI error compatibility updates: 15 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after structured CLI error compatibility updates.
- `npm run smoke --prefix WindowsTray` passed after structured CLI error compatibility updates.
- `npm run check --prefix WindowsTray` passed after notification alert updates.
- `npm test --prefix WindowsTray` passed after notification alert updates: 18 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after notification alert updates.
- `npm run smoke --prefix WindowsTray` passed after notification alert updates.
- `git diff --check` passed after notification alert updates; output only contained Windows CRLF conversion warnings.
- `npm run check --prefix WindowsTray` passed after right-click maintenance and reset-row UI updates.
- `npm test --prefix WindowsTray` passed after right-click maintenance and reset-row UI updates: 22 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after right-click maintenance and reset-row UI updates; it now asserts reset row status order is time-first.
- `npm run smoke --prefix WindowsTray` passed after right-click maintenance and reset-row UI updates.
- Maintenance actions were not manually clicked during verification because session sync/repair mutates `~/.codex` and restart actions intentionally restart local apps; script coverage verifies the generated restart scripts and embedded sync/repair helper structure.
- `npm run check --prefix WindowsTray` passed after Chinese right-click status summary updates.
- `npm test --prefix WindowsTray` passed after Chinese right-click status summary updates: 23 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after Chinese right-click status summary updates.
- `npm run smoke --prefix WindowsTray` passed after Chinese right-click status summary updates.
- `npm run check --prefix WindowsTray` passed after startup/update-check settings.
- `npm test --prefix WindowsTray` passed after startup/update-check settings: 28 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after startup/update-check settings.
- `npm run smoke --prefix WindowsTray` passed after startup/update-check settings.
- `npm run check --prefix WindowsTray` passed after quota/recent-session detail pages.
- `npm test --prefix WindowsTray` passed after quota/recent-session detail pages: 28 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after quota/recent-session detail pages.
- `npm run smoke --prefix WindowsTray` passed after quota/recent-session detail pages.
- PowerShell parser check passed for `Scripts\Package-WindowsTray.ps1`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File Scripts\Package-WindowsTray.ps1` passed and produced `.build\windows-tray-portable\Codex Runway` plus `.build\CodexRunway-Windows-Portable.zip`.
- Package content check passed for `Codex Runway.exe`, `resources\app\main.js`, `resources\app\package.json`, `resources\CodexRunwayCLI.exe`, `resources\Resources\AppIcon.png`, and `README-Windows-Portable.txt`; 32 Swift runtime DLLs were bundled under `resources`.
- Packaged smoke verification passed with `Start-Process -Wait` against `.build\windows-tray-portable\Codex Runway\Codex Runway.exe --smoke`.
- `npm run check --prefix WindowsTray` passed after portable package updates.
- `npm test --prefix WindowsTray` passed after portable package updates: 28 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after portable package updates.
- `npm run smoke --prefix WindowsTray` passed after portable package updates.
- `npm run ui-smoke --prefix WindowsTray` first failed with `quota window cards missing: 0`, proving the new detail-page assertions caught the repeated-homepage problem.
- `npm run check --prefix WindowsTray` passed after richer detail-page updates.
- `npm run ui-smoke --prefix WindowsTray` passed after richer detail-page updates.
- `npm test --prefix WindowsTray` passed after richer detail-page updates: 28 tests, 0 failures.
- `npm run smoke --prefix WindowsTray` passed after richer detail-page updates.
- `powershell -NoProfile -ExecutionPolicy Bypass -File Scripts\Package-WindowsTray.ps1` passed after richer detail-page updates and regenerated the portable zip.
- Packaged smoke verification passed again with `Start-Process -Wait` against `.build\windows-tray-portable\Codex Runway\Codex Runway.exe --smoke`.
- `npm run check --prefix WindowsTray` passed after settings parity updates.
- `npm test --prefix WindowsTray` passed after settings parity updates: 31 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after settings parity updates and now asserts appearance changes, status JSON export toggle behavior, and settings action buttons.
- `npm run check --prefix WindowsTray` passed after diagnostics/recovery updates.
- `npm test --prefix WindowsTray` passed after diagnostics/recovery updates: 32 tests, 0 failures.
- `npm run ui-smoke --prefix WindowsTray` passed after diagnostics/recovery updates and now asserts the error panel opens `诊断与恢复`.
- `npm run smoke --prefix WindowsTray` passed after diagnostics/recovery updates.
- `powershell -NoProfile -ExecutionPolicy Bypass -File Scripts\Package-WindowsTray.ps1` passed after settings and diagnostics updates, regenerating `.build\windows-tray-portable\Codex Runway` and `.build\CodexRunway-Windows-Portable.zip`.
- Packaged smoke verification passed after settings and diagnostics updates with `Start-Process -Wait` against `.build\windows-tray-portable\Codex Runway\Codex Runway.exe --smoke`.

Known Blockers:
- Native SwiftPM build/test on this Windows Swift 6.3.2 toolchain fails with `error: fatalError`; direct `swiftc` compilation works. Do not claim `swift test` passes on Windows.
- The Windows tray runtime has been smoke-tested and manually inspected, and a portable unsigned package now exists. It is still experimental and not a signed installer.
- The development Windows CLI executable currently depends on the installed Swift runtime being present; the portable package bundles Swift runtime DLLs beside the CLI.
- Several macOS app/release features are not yet ported: signed installer/notarization-equivalent distribution, automatic in-app updating, and macOS regression verification. Windows tray settings now cover the settings that have real Windows runtime behavior.

## History

- 2026-07-01: Cloned `Licoy/codex-runway` into `work/codex-runway`.
- 2026-07-01: Added initial cross-platform CLI source changes and a Superpowers plan at `docs/superpowers/plans/2026-07-01-windows-cli.md`.
- 2026-07-01: Added CLI JSON status snapshots and an Electron Windows tray scaffold.
- 2026-07-02: Installed Swift 6.3.2, verified SwiftPM failure, added manual Windows CLI build script, installed Electron dependencies, and smoke-tested the tray against the built CLI.
- 2026-07-02: Iterated on Windows popup UI after user inspection, added reset credit row details, and changed window controls to hide instead of quitting the tray process.
- 2026-07-02: Added Windows tray settings persistence/UI, renderer UI smoke coverage, and default discovery of the manual Windows CLI executable.
- 2026-07-02: Added transient Windows tray refresh retry and friendly timeout/network error formatting.
- 2026-07-02: Added structured CLI JSON error fields and updated the tray to prefer them.
- 2026-07-03: Added opt-in Windows tray notification alerts with local de-duplication.
- 2026-07-03: Added right-click maintenance actions and tightened reset credit detail row layout.
- 2026-07-03: Localized Windows right-click tray status summary lines to Chinese.
- 2026-07-03: Added Windows tray startup and update-check settings.
- 2026-07-03: Added quota and recent-session detail pages to the Windows popup.
- 2026-07-03: Added a portable Windows tray package script and verified the packaged app smoke path.
- 2026-07-03: Expanded Windows detail pages so clicking into a section exposes additional metadata instead of repeating homepage cards.
- 2026-07-04: Expanded Windows settings parity with appearance selection, local status JSON export, test notification, GitHub/feedback/about actions, and UI smoke coverage.
- 2026-07-04: Added Windows refresh diagnostics/recovery detail page and token-safe diagnostic copy text.
