#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SwiftRoot = $env:SWIFT_ROOT,
    [string]$OutputRoot = "",
    [string]$ArchivePath = "",
    [switch]$SkipCliBuild,
    [switch]$SkipNpmInstall,
    [switch]$NoArchive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WindowsTrayDir = Join-Path $RepoRoot "WindowsTray"
$CliBuildDir = Join-Path $RepoRoot ".build\windows-package-cli"

if (-not $OutputRoot) {
    $OutputRoot = Join-Path $RepoRoot ".build\windows-tray-portable"
}
if (-not $ArchivePath) {
    $ArchivePath = Join-Path (Join-Path $RepoRoot ".build") "CodexRunway-Windows-Portable.zip"
}
if (-not $SwiftRoot) {
    if (-not $env:LOCALAPPDATA) {
        throw "SWIFT_ROOT is not set and LOCALAPPDATA is unavailable."
    }
    $SwiftRoot = Join-Path $env:LOCALAPPDATA "Programs\Swift"
}

function Get-FullPath([string]$Path) {
    return [IO.Path]::GetFullPath($Path)
}

function Assert-ChildPath([string]$Child, [string]$Parent) {
    $parentFull = (Get-FullPath $Parent).TrimEnd("\", "/") + [IO.Path]::DirectorySeparatorChar
    $childFull = Get-FullPath $Child
    if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify path outside intended directory. Child: $childFull Parent: $parentFull"
    }
}

function Reset-Directory([string]$Path, [string]$Parent) {
    New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    if (Test-Path -LiteralPath $Path) {
        Assert-ChildPath $Path $Parent
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
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

if (-not $SkipCliBuild) {
    $buildArgs = @{
        OutputDirectory = $CliBuildDir
    }
    if ($SwiftRoot) {
        $buildArgs.SwiftRoot = $SwiftRoot
    }
    & (Join-Path $PSScriptRoot "Build-WindowsCLI.ps1") @buildArgs
}

$electronExe = Join-Path $WindowsTrayDir "node_modules\electron\dist\electron.exe"
if ((-not $SkipNpmInstall) -and (-not (Test-Path -LiteralPath $electronExe))) {
    Invoke-Checked "npm.cmd" @("install", "--prefix", $WindowsTrayDir)
}

$electronDist = Join-Path $WindowsTrayDir "node_modules\electron\dist"
if (-not (Test-Path -LiteralPath $electronExe)) {
    throw "Electron runtime not found. Run npm install --prefix WindowsTray or omit -SkipNpmInstall."
}

$packageDir = Join-Path $OutputRoot "Codex Runway"
$resourcesDir = Join-Path $packageDir "resources"
$appDir = Join-Path $resourcesDir "app"

Reset-Directory $packageDir $OutputRoot
Copy-Item -Path (Join-Path $electronDist "*") -Destination $packageDir -Recurse -Force

$packagedElectronExe = Join-Path $packageDir "electron.exe"
$packagedAppExe = Join-Path $packageDir "Codex Runway.exe"
if (-not (Test-Path -LiteralPath $packagedElectronExe)) {
    throw "Packaged electron.exe was not copied."
}
Move-Item -LiteralPath $packagedElectronExe -Destination $packagedAppExe -Force

New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Get-ChildItem -LiteralPath $WindowsTrayDir -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $appDir -Force
}
Get-ChildItem -LiteralPath $WindowsTrayDir -Directory |
    Where-Object { $_.Name -notin @("node_modules", "test") } |
    ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $appDir -Recurse -Force
    }

$assetDir = Join-Path $resourcesDir "Resources"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Copy-Item -LiteralPath (Join-Path $RepoRoot "Resources\AppIcon.png") -Destination $assetDir -Force

$builtCli = Join-Path $CliBuildDir "CodexRunwayCLI.exe"
if (-not (Test-Path -LiteralPath $builtCli)) {
    throw "Built CLI not found: $builtCli"
}
Copy-Item -LiteralPath $builtCli -Destination $resourcesDir -Force

$runtime = Get-LatestDirectory (Join-Path $SwiftRoot "Runtimes")
$runtimeBin = Join-Path $runtime.FullName "usr\bin"
$runtimeDlls = Get-ChildItem -LiteralPath $runtimeBin -Filter "*.dll"
if (-not $runtimeDlls) {
    throw "No Swift runtime DLLs found in $runtimeBin"
}
$runtimeDlls | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $resourcesDir -Force
}

@"
Codex Runway Windows Portable

Run Codex Runway.exe to start the tray app.
The bundled CodexRunwayCLI.exe reads local Codex auth and session data.
This package is unsigned and portable; unzip it before running.
"@ | Set-Content -LiteralPath (Join-Path $packageDir "README-Windows-Portable.txt") -Encoding UTF8

if (-not $NoArchive) {
    $archiveFull = Get-FullPath $ArchivePath
    $buildRoot = Get-FullPath (Join-Path $RepoRoot ".build")
    Assert-ChildPath $archiveFull $buildRoot
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ArchivePath) | Out-Null
    if (Test-Path -LiteralPath $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }
    Compress-Archive -LiteralPath $packageDir -DestinationPath $ArchivePath -Force
    Write-Host "Packaged $packageDir"
    Write-Host "Archived $ArchivePath"
} else {
    Write-Host "Packaged $packageDir"
}
