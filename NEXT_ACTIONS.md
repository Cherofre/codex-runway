## Now

1. Regenerate the portable Windows tray package after the latest settings and diagnostics changes.
2. Restart the local Windows tray preview after packaging and let the user inspect the popup/menu.
3. Manually verify right-click tray actions when acceptable: `同步/修复会话`, `重启 Codex`, and `重启 VSCode`.
4. Decide whether to keep `Scripts\Build-WindowsCLI.ps1` as the Windows development path or continue investigating SwiftPM's `error: fatalError`.
5. If investigating SwiftPM, start from the reproduced command: `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v`.
6. Re-test on macOS before merging, because `Package.swift` now gates the AppKit app and dependencies under `#if os(macOS)`.
7. For a release-quality Windows build, decide whether to add a signed installer/update channel on top of the current portable unsigned package.

## Handoff Notes

Start here: restart the preview with `npm run preview --prefix WindowsTray` or inspect the portable package at `.build\windows-tray-portable\Codex Runway`; `Scripts\Build-WindowsCLI.ps1` remains the development CLI build path and `Scripts\Package-WindowsTray.ps1` creates the portable Windows package.

Do not redo:
- Swift 6.3.2 and Visual Studio Build Tools are already installed locally.
- `Package.swift` already separates macOS app target from cross-platform CLI targets.
- `QuotaClient` and `TokenRefresher` already conditionally import `FoundationNetworking`.
- `AuthStore` and `SessionRepairService` already avoid Apple-only replacement/write APIs outside Apple platforms.
- `CodexRunwayCLI --json` errors now preserve `area/message` and add `code/rawMessage/isRetryable`; new frontends should prefer `code` and `isRetryable`.
- `WindowsTray/status.js` already resolves the CLI, prepends common Swift runtime paths for child processes, and formats known network errors into user-facing text.
- `WindowsTray/status.js` now prefers `.build\windows-cli\CodexRunwayCLI.exe`, the manual Windows build output, before falling back to SwiftPM.
- `WindowsTray/refresh.js` retries one transient CLI status snapshot when quota/reset/API errors indicate timeout or connection loss.
- `npm install --prefix WindowsTray` has already been run; `WindowsTray/package-lock.json` exists.
- The popup close controls now hide the panel only; full quit is in the tray context menu.
- Reset credit row details are available through `resetCredits.credits[]` in the CLI JSON.
- Windows tray settings are implemented and stored under Electron `userData`; implemented settings include refresh interval, appearance, homepage visibility, startup, notifications, update checks, and status JSON export.
- Windows tray startup and update-check settings are implemented. Update checking opens GitHub Releases when a newer tag is found; it does not silently install updates.
- Notification alerts are implemented as an opt-in setting and de-duplicated through Electron `userData/alerts.json`.
- Right-click tray maintenance actions are implemented. Session sync/repair asks for confirmation, writes backups under `~/.codex/backups_state/provider-sync` when it changes files, and was not manually clicked during automated verification.
- Quota, reset, API, and recent-session entries now open Chinese detail pages with information that is not duplicated from the homepage; UI smoke asserts richer detail metadata.
- Settings include appearance selection, test notification, status JSON export/open-folder actions, GitHub/feedback/about rows, and UI smoke coverage for the main settings interactions.
- Refresh errors now open a `诊断与恢复` detail page with immediate retry, token-safe diagnostic copy, Codex folder, and status JSON folder actions.
- A portable unsigned Windows package is implemented by `Scripts\Package-WindowsTray.ps1`; it bundles the tray app, `CodexRunwayCLI.exe`, app icon, and Swift runtime DLLs.

Verify next:
- `npm run preview --prefix WindowsTray` for persistent popup UI behavior, especially settings and upcoming diagnostics actions.
- Manually inspect that each detail page is visually useful: recent sessions should show summary metrics, exact timestamps, and full IDs; quota should show per-window cards; API should show exact window/explainer rows; reset should show full per-credit metadata.
- Manually verify right-click tray actions when acceptable: `同步/修复会话`, `重启 Codex`, and `重启 VSCode`.
- `npm run ui-smoke --prefix WindowsTray` for renderer settings, quota/reset/recent detail pages, and friendly error smoke coverage.
- `powershell -NoProfile -ExecutionPolicy Bypass -File Scripts\Package-WindowsTray.ps1` followed by `.build\windows-tray-portable\Codex Runway\Codex Runway.exe --smoke` with `Start-Process -Wait` for package verification.
- `swift test` on macOS for regression coverage.
- `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v` only if checking whether the Windows SwiftPM blocker has changed.

Do not claim:
- Do not claim Windows `swift test` passes; it currently fails with SwiftPM `error: fatalError`.
- Do not claim a signed Windows installer or automatic self-updater exists; only an unsigned portable package exists.
- Do not claim full macOS feature parity; signed installer/update automation, macOS regression testing, and manual verification of destructive maintenance actions remain.
