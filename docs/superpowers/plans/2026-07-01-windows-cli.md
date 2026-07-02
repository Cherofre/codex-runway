# Windows CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform CLI entry point that can run on Windows before building a tray UI.

**Architecture:** Keep `CodexRunwayCore` as the shared data and API layer. Add a small `CodexRunwayCLIKit` target for argument parsing, formatting, and orchestration, plus a thin `CodexRunwayCLI` executable target. Keep the existing AppKit/SwiftUI app target macOS-only in the package manifest.

**Tech Stack:** SwiftPM, Swift 6, Foundation, optional `FoundationNetworking` for non-Apple URLSession support.

---

### Task 1: Package And Portability

**Files:**
- Modify: `Package.swift`
- Modify: `Sources/CodexRunwayCore/QuotaClient.swift`
- Modify: `Sources/CodexRunwayCore/TokenRefresher.swift`
- Modify: `Sources/CodexRunwayCore/AuthStore.swift`
- Modify: `Sources/CodexRunwayCore/SingleInstanceGuard.swift`

- [x] Make non-macOS package builds expose only core and CLI targets.
- [x] Import `FoundationNetworking` when available.
- [x] Avoid Apple-only file protection options outside Apple platforms.
- [x] Keep the macOS app target unchanged for macOS builds.

### Task 2: CLI Target

**Files:**
- Create: `Sources/CodexRunwayCLIKit/RunwayCLI.swift`
- Create: `Sources/CodexRunwayCLI/main.swift`
- Create: `Tests/CodexRunwayCLIKitTests/RunwayCLIArgumentTests.swift`

- [x] Add tests for `--help`, `--self-check`, default `status`, and unknown arguments.
- [x] Implement the argument parser and output formatting.
- [x] Implement `status` to load auth, refresh expired tokens, fetch quota/reset credits, and print local session/cost summaries.
- [x] Implement `--self-check` without AppKit.

### Task 3: Verification

**Files:**
- None

- [x] Install Swift 6.3.2 and Visual Studio Build Tools on Windows.
- [x] Confirm `swift test` currently fails in SwiftPM with `error: fatalError`.
- [x] Add `Scripts/Build-WindowsCLI.ps1` as a manual Windows `swiftc` build path while SwiftPM is blocked.
- [x] Run `Scripts\Build-WindowsCLI.ps1`.
- [x] Run `.build\windows-cli\CodexRunwayCLI.exe --help`.
- [ ] Run `swift run CodexRunwayCLI --self-check`.
- [x] On Windows, run `CodexRunwayCLI.exe --json` after Codex login creates `%USERPROFILE%\.codex\auth.json`.

### Task 4: JSON Contract And Windows Tray Scaffold

**Files:**
- Modify: `Sources/CodexRunwayCLIKit/RunwayCLI.swift`
- Modify: `Tests/CodexRunwayCLIKitTests/RunwayCLIArgumentTests.swift`
- Create: `Tests/CodexRunwayCLIKitTests/RunwayCLIJSONTests.swift`
- Create: `WindowsTray/package.json`
- Create: `WindowsTray/main.js`
- Create: `WindowsTray/status.js`
- Create: `WindowsTray/test/status.test.js`
- Create: `WindowsTray/README.md`

- [x] Add `--json` and `status --json` parsing.
- [x] Add a stable JSON snapshot schema for tray consumption.
- [x] Add an Electron tray host that invokes `CodexRunwayCLI --json`.
- [x] Add Node tests for CLI resolution and status formatting.
- [x] Run `npm test --prefix WindowsTray`.
- [x] Run `node --check WindowsTray/main.js`.
- [x] Run `node --check WindowsTray/status.js`.
- [x] Run `npm run smoke --prefix WindowsTray` with `CODEX_RUNWAY_CLI` pointing at the built CLI.
