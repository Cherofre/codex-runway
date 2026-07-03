## Active Decisions

### Decision: Use CLI JSON As Tray Boundary

Status: active

Context: The original app is AppKit/SwiftUI-only. The Windows tray host should not duplicate quota/session parsing.

Decision: Add a stable `CodexRunwayCLI --json` output contract and make the Windows tray host consume that contract.

Consequences:
- Tray technology can change later without rewriting Codex data logic.
- CLI can be tested independently from the tray UI.
- Runtime still needs a built `CodexRunwayCLI` executable or Swift toolchain available.

### Decision: Avoid .NET Tray Host For Now

Status: active

Context: This Windows machine has Node.js but no .NET SDK.

Decision: Prefer a Node/Electron-style tray scaffold for the local continuation path.

Consequences:
- Local package scripts can be inspected with existing Node.
- A future contributor can still replace the tray host with .NET if desired.

### Decision: Pin Electron 43.0.0 For Tray Scaffold

Status: active

Context: Electron is only used for the Windows tray host scaffold, and the machine has Node.js available.

Decision: Pin `electron` to `43.0.0` in `WindowsTray/package.json`.

Consequences:
- The tray scaffold uses the current stable Electron major observed during implementation.
- The dependency still needs `npm install --prefix WindowsTray` before runtime launch.

### Decision: Keep Manual Windows CLI Build Script

Status: active

Context: Windows SwiftPM with Swift 6.3.2 fails during `swift test`/`swift build` with `error: fatalError` after printing the `CodexRunwayCore` compiler command and no Swift source diagnostics. Direct `swiftc` compilation of the same code succeeds.

Decision: Add `Scripts\Build-WindowsCLI.ps1` to build `CodexRunwayCore`, `CodexRunwayCLIKit`, and `CodexRunwayCLI` directly with `swiftc` into `.build/windows-cli/CodexRunwayCLI.exe`.

Consequences:
- Windows development can run and smoke-test the CLI/tray without waiting on SwiftPM.
- SwiftPM remains the intended package-level build path once the toolchain issue is fixed.
- The script depends on a local Swift toolchain and Visual Studio Build Tools.

### Decision: Preserve macOS Package.resolved

Status: active

Context: On Windows, the platform-gated manifest resolves no external dependencies and SwiftPM deletes `Package.resolved`. The original file still pins the macOS-only CalendarView and Sparkle dependencies.

Decision: Restore and preserve `Package.resolved` after Windows SwiftPM attempts.

Consequences:
- macOS dependency lock state remains intact.
- Future Windows `swift build`/`swift test` attempts may delete it again and require restoration before committing.

### Decision: Window Close Hides Panel

Status: active

Context: The Electron popup initially exposed a footer button labeled as quit, which exited the whole tray process. In a tray app, users expect window-level close actions to hide the panel while the tray stays resident.

Decision: Popup close controls hide the `BrowserWindow`. Full process termination remains available only through the tray context menu `Quit`.

Consequences:
- The popup behaves more like a tray/status app and matches user expectation.
- The app still has a clear explicit quit path.
- Future settings pages should avoid ambiguous labels like "退出" unless they really stop the tray process.

### Decision: Persist Windows Tray Settings In Electron userData

Status: active

Context: The Windows tray host needs local preferences before there is a packaged installer or full macOS parity. Settings should not mutate Codex auth/session files.

Decision: Store Windows tray preferences in Electron `userData/settings.json` and expose only settings that currently have real runtime behavior: refresh interval and homepage section visibility.

Consequences:
- Preferences survive tray restarts without touching `~/.codex`.
- Renderer settings can be smoke-tested through Electron IPC.
- System-level features such as startup integration, notifications, and update checks stay visible as not-yet-ported status rows until they are implemented.

### Decision: Handle Transient Network Errors In The Tray Host

Status: active

Context: The CLI may return partial JSON snapshots when remote quota endpoints time out, for example `NSURLErrorDomain error -1001`. Showing raw NSError text in the tray panel is confusing, and a single timeout often succeeds on a quick retry.

Decision: Keep the CLI JSON boundary intact and handle transient retry plus friendly text in the Windows tray host. Retry one snapshot when quota/reset/API errors indicate timeout or connection loss; format known network errors before rendering menus or the popup error panel.

Consequences:
- The Windows tray becomes less noisy during temporary network failures.
- Auth/config errors still surface without retry loops.
- CLI JSON now also emits `code`, `rawMessage`, and `isRetryable`; the tray prefers those fields while keeping text parsing as a fallback for older CLI output.

### Decision: Make Windows Notifications Opt-In And Locally De-Duplicated

Status: active

Context: Quota and reset-credit alerts are useful on Windows, but enabling them by default could spam users with historical quota state on first launch.

Decision: Add a `notificationsEnabled` tray setting that defaults to false, derive notification candidates from CLI JSON snapshots in `WindowsTray/alerts.js`, and store delivered alert IDs in Electron `userData/alerts.json`.

Consequences:
- Users can enable Windows system notifications from the settings page when they want them.
- The first implementation avoids repeating the same quota threshold or reset-credit expiry after restart.
- Packaging work may later need to revisit Windows notification identity and installer metadata.

### Decision: Add Maintenance Actions To The Tray Context Menu

Status: active

Context: The local `codex-tray-switcher` PowerShell tool already has useful Windows-only operations for restarting Codex/VSCode and repairing Codex session provider/index metadata.

Decision: Move the useful operations into the Electron tray context menu instead of running a second tray app. Restart actions execute hidden PowerShell scripts. Session sync/repair runs a temporary embedded Python helper, asks for confirmation first, and backs up changed Codex state under `~/.codex/backups_state/provider-sync`.

Consequences:
- Users can access common Codex maintenance actions from the same Runway tray icon.
- The session sync/repair action remains explicit because it can modify JSONL and SQLite state.
- Future work can move this repair capability behind the Swift CLI boundary if cross-platform reuse becomes important.
