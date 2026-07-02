#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SwiftRoot = $env:SWIFT_ROOT,
    [string]$VisualStudioDevCmd = "",
    [string]$OutputDirectory = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $RepoRoot ".build\windows-cli"
}
if (-not $SwiftRoot) {
    if (-not $env:LOCALAPPDATA) {
        throw "SWIFT_ROOT is not set and LOCALAPPDATA is unavailable."
    }
    $SwiftRoot = Join-Path $env:LOCALAPPDATA "Programs\Swift"
}

function Get-VersionKey([string]$Name) {
    $clean = $Name -replace "\+.*$", ""
    try {
        return [version]$clean
    } catch {
        return [version]"0.0"
    }
}

function Get-LatestDirectory([string]$Parent) {
    if (-not (Test-Path -LiteralPath $Parent)) {
        throw "Directory not found: $Parent"
    }
    $items = Get-ChildItem -LiteralPath $Parent -Directory
    if (-not $items) {
        throw "No versioned directories found under: $Parent"
    }
    return $items | Sort-Object @{ Expression = { Get-VersionKey $_.Name } }, Name | Select-Object -Last 1
}

function Find-VisualStudioDevCmd {
    param([string]$ExplicitPath)
    if ($ExplicitPath) {
        if (Test-Path -LiteralPath $ExplicitPath) { return $ExplicitPath }
        throw "VsDevCmd.bat not found: $ExplicitPath"
    }

    $base = ${env:ProgramFiles(x86)}
    if (-not $base) {
        throw "ProgramFiles(x86) is unavailable; pass -VisualStudioDevCmd explicitly."
    }

    $candidates = @(
        "BuildTools",
        "Community",
        "Professional",
        "Enterprise"
    ) | ForEach-Object {
        Join-Path $base "Microsoft Visual Studio\2022\$_\Common7\Tools\VsDevCmd.bat"
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "VsDevCmd.bat was not found. Install Visual Studio Build Tools or pass -VisualStudioDevCmd."
}

function Import-DevCmdEnvironment([string]$DevCmdPath) {
    $escaped = $DevCmdPath.Replace('"', '\"')
    $lines = & cmd.exe /d /s /c "call `"$escaped`" -arch=x64 -host_arch=x64 >nul && set"
    if ($LASTEXITCODE -ne 0) {
        throw "VsDevCmd.bat failed with exit code $LASTEXITCODE."
    }
    foreach ($line in $lines) {
        if ($line -match "^([^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

function Invoke-SwiftC([string[]]$Arguments) {
    & $SwiftC @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "swiftc failed with exit code $LASTEXITCODE."
    }
}

$Toolchain = Get-LatestDirectory (Join-Path $SwiftRoot "Toolchains")
$Runtime = Get-LatestDirectory (Join-Path $SwiftRoot "Runtimes")
$Platform = Get-LatestDirectory (Join-Path $SwiftRoot "Platforms")
$SwiftC = Join-Path $Toolchain.FullName "usr\bin\swiftc.exe"
$ToolchainBin = Join-Path $Toolchain.FullName "usr\bin"
$RuntimeBin = Join-Path $Runtime.FullName "usr\bin"
$PythonDir = Join-Path $SwiftRoot "Python-3.10.1"
$SdkRoot = Join-Path $Platform.FullName "Windows.platform\Developer\SDKs\Windows.sdk"

if (-not (Test-Path -LiteralPath $SwiftC)) { throw "swiftc.exe not found: $SwiftC" }
if (-not (Test-Path -LiteralPath $SdkRoot)) { throw "Windows Swift SDK not found: $SdkRoot" }

$DevCmd = Find-VisualStudioDevCmd $VisualStudioDevCmd
Import-DevCmdEnvironment $DevCmd

$pathParts = @($ToolchainBin, $RuntimeBin)
if (Test-Path -LiteralPath $PythonDir) { $pathParts += $PythonDir }
$env:SWIFT_ROOT = $SwiftRoot
$env:SDKROOT = $SdkRoot
$env:Path = ($pathParts + $env:Path) -join [IO.Path]::PathSeparator

$ModulesDir = Join-Path $OutputDirectory "Modules"
$ObjectsDir = Join-Path $OutputDirectory "Objects"
$ModuleCache = Join-Path $OutputDirectory "ModuleCache"
New-Item -ItemType Directory -Force -Path $ModulesDir, $ObjectsDir, $ModuleCache | Out-Null

$CommonArgs = @(
    "-target", "x86_64-unknown-windows-msvc",
    "-sdk", $SdkRoot,
    "-swift-version", "6",
    "-DSWIFT_PACKAGE",
    "-DSWIFT_MODULE_RESOURCE_BUNDLE_UNAVAILABLE",
    "-static",
    "-module-cache-path", $ModuleCache
)

$CoreModule = Join-Path $ModulesDir "CodexRunwayCore.swiftmodule"
$CoreObject = Join-Path $ObjectsDir "CodexRunwayCore.o"
$CoreSources = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "Sources\CodexRunwayCore") -Filter "*.swift" |
    Sort-Object Name |
    ForEach-Object { $_.FullName }
Invoke-SwiftC (@(
    "-module-name", "CodexRunwayCore",
    "-emit-module",
    "-emit-module-path", $CoreModule,
    "-whole-module-optimization",
    "-parse-as-library",
    "-c"
) + $CoreSources + @(
    "-I", $ModulesDir,
    "-o", $CoreObject
) + $CommonArgs)

$CLIKitModule = Join-Path $ModulesDir "CodexRunwayCLIKit.swiftmodule"
$CLIKitObject = Join-Path $ObjectsDir "CodexRunwayCLIKit.o"
Invoke-SwiftC (@(
    "-module-name", "CodexRunwayCLIKit",
    "-emit-module",
    "-emit-module-path", $CLIKitModule,
    "-parse-as-library",
    "-c", (Join-Path $RepoRoot "Sources\CodexRunwayCLIKit\RunwayCLI.swift"),
    "-I", $ModulesDir,
    "-o", $CLIKitObject
) + $CommonArgs)

$MainObject = Join-Path $ObjectsDir "CodexRunwayCLI-main.o"
Invoke-SwiftC (@(
    "-c", (Join-Path $RepoRoot "Sources\CodexRunwayCLI\main.swift"),
    "-I", $ModulesDir,
    "-o", $MainObject
) + $CommonArgs)

$Executable = Join-Path $OutputDirectory "CodexRunwayCLI.exe"
Invoke-SwiftC (@(
    $MainObject,
    $CLIKitObject,
    $CoreObject,
    "-o", $Executable,
    "-I", $ModulesDir
) + $CommonArgs + @(
    "-libc", "MD",
    "-use-ld=lld",
    "-Xcc", "-D_MT",
    "-Xcc", "-D_DLL",
    "-Xcc", "-Xclang",
    "-Xcc", "--dependent-lib=msvcrt"
))

Write-Host "Built $Executable"
