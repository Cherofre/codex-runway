# Codex Runway Windows Tray

This is a lightweight Electron tray host for the cross-platform `CodexRunwayCLI`.

## Development

```powershell
powershell -ExecutionPolicy Bypass -File Scripts\Build-WindowsCLI.ps1
npm install --prefix WindowsTray
npm test --prefix WindowsTray
$env:CODEX_RUNWAY_CLI = "$PWD\.build\windows-cli\CodexRunwayCLI.exe"
npm run smoke --prefix WindowsTray
npm run preview --prefix WindowsTray
npm start --prefix WindowsTray
```

The tray host looks for the CLI in this order:

1. `CODEX_RUNWAY_CLI`
2. `../.build/release/CodexRunwayCLI.exe`
3. `../.build/debug/CodexRunwayCLI.exe`
4. `swift run CodexRunwayCLI --json`

The tray reads machine-readable status from:

```powershell
swift run CodexRunwayCLI --json
```

For a non-interactive startup check, set `CODEX_RUNWAY_CLI` to a built CLI executable and run:

```powershell
$env:CODEX_RUNWAY_CLI = "$PWD\.build\windows-cli\CodexRunwayCLI.exe"
npm run smoke --prefix WindowsTray
```

## Current Limitation

This host requires a working `CodexRunwayCLI` binary or a Swift toolchain that can run the CLI target.
