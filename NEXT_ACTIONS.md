## Now

1. Continue Windows parity work from the current popup panel: complete detail side panels and packaged Windows distribution are still missing.
2. Decide whether to keep `Scripts\Build-WindowsCLI.ps1` as the Windows development path or continue investigating SwiftPM's `error: fatalError`.
3. If investigating SwiftPM, start from the reproduced command: `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v`.
4. Re-test on macOS before merging, because `Package.swift` now gates the AppKit app and dependencies under `#if os(macOS)`.
5. For distributable Windows builds, decide whether to bundle Swift runtime DLLs beside `CodexRunwayCLI.exe` or require a local Swift installation.

## Handoff Notes

Start here: `WindowsTray\main.js`, `WindowsTray\renderer.js`, `WindowsTray\window.css`, `WindowsTray\settings.js`, `WindowsTray\alerts.js`, and `WindowsTray\maintenance.js` for popup/settings/notification/maintenance behavior; `Scripts\Build-WindowsCLI.ps1` remains the working Windows CLI build path.

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
- Basic Windows tray settings are implemented and stored under Electron `userData`; unsupported system settings are shown as not-yet-ported status rows.
- Windows tray startup and update-check settings are implemented. Update checking opens GitHub Releases when a newer tag is found; it does not silently install updates.
- Notification alerts are implemented as an opt-in setting and de-duplicated through Electron `userData/alerts.json`.
- Right-click tray maintenance actions are implemented. Session sync/repair asks for confirmation, writes backups under `~/.codex/backups_state/provider-sync` when it changes files, and was not manually clicked during automated verification.

Verify next:
- `npm run preview --prefix WindowsTray` for persistent popup UI behavior.
- Manually verify right-click tray actions when acceptable: `同步/修复会话`, `重启 Codex`, and `重启 VSCode`.
- `npm run ui-smoke --prefix WindowsTray` for renderer settings, reset detail, and friendly error smoke coverage.
- `swift test` on macOS for regression coverage.
- `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v` only if checking whether the Windows SwiftPM blocker has changed.

Do not claim:
- Do not claim Windows `swift test` passes; it currently fails with SwiftPM `error: fatalError`.
- Do not claim a packaged Windows app exists; this is a development tray host plus CLI build script.
- Do not claim feature parity with the macOS app; notifications, update checks, session repair actions, packaging, signing, and system-level settings are not complete.
