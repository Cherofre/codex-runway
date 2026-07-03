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

To create a portable Windows package:

```powershell
powershell -ExecutionPolicy Bypass -File Scripts\Package-WindowsTray.ps1
```

The package is written to `.build\windows-tray-portable\Codex Runway`, with a zip archive at `.build\CodexRunway-Windows-Portable.zip`.

The tray host looks for the CLI in this order:

1. `CODEX_RUNWAY_CLI`
2. bundled `resources\CodexRunwayCLI.exe` in the portable package
3. `../.build/windows-cli/CodexRunwayCLI.exe`
4. `../.build/release/CodexRunwayCLI.exe`
5. `../.build/debug/CodexRunwayCLI.exe`
6. `swift run CodexRunwayCLI --json`

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
