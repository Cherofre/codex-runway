## Now

1. Continue Windows parity work from the current popup panel: settings implementation, notification alerts, update checking, session repair actions, and complete detail side panels are still missing.
2. Decide whether to keep `Scripts\Build-WindowsCLI.ps1` as the Windows development path or continue investigating SwiftPM's `error: fatalError`.
3. If investigating SwiftPM, start from the reproduced command: `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v`.
4. Re-test on macOS before merging, because `Package.swift` now gates the AppKit app and dependencies under `#if os(macOS)`.
5. For distributable Windows builds, decide whether to bundle Swift runtime DLLs beside `CodexRunwayCLI.exe` or require a local Swift installation.

## Handoff Notes

Start here: `WindowsTray\main.js`, `WindowsTray\renderer.js`, and `WindowsTray\window.css` for popup behavior; `Scripts\Build-WindowsCLI.ps1` remains the working Windows CLI build path.

Do not redo:
- Swift 6.3.2 and Visual Studio Build Tools are already installed locally.
- `Package.swift` already separates macOS app target from cross-platform CLI targets.
- `QuotaClient` and `TokenRefresher` already conditionally import `FoundationNetworking`.
- `AuthStore` and `SessionRepairService` already avoid Apple-only replacement/write APIs outside Apple platforms.
- `WindowsTray/status.js` already resolves the CLI and prepends common Swift runtime paths for child processes.
- `npm install --prefix WindowsTray` has already been run; `WindowsTray/package-lock.json` exists.
- The popup close controls now hide the panel only; full quit is in the tray context menu.
- Reset credit row details are available through `resetCredits.credits[]` in the CLI JSON.

Verify next:
- `npm run preview --prefix WindowsTray` for persistent popup UI behavior.
- `swift test` on macOS for regression coverage.
- `swift test --scratch-path C:\tmp\cr-test-final --disable-index-store -j 1 -v` only if checking whether the Windows SwiftPM blocker has changed.

Do not claim:
- Do not claim Windows `swift test` passes; it currently fails with SwiftPM `error: fatalError`.
- Do not claim a packaged Windows app exists; this is a development tray host plus CLI build script.
- Do not claim feature parity with the macOS app; settings, notifications, update checks, session repair actions, packaging, and signing are not complete.
