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
