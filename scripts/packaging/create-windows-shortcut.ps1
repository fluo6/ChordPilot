[CmdletBinding()]
param(
    [string]$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRootPath = [System.IO.Path]::GetFullPath($RepositoryRoot)
$distPath = Join-Path $repositoryRootPath "dist"
$shortcutPath = Join-Path $repositoryRootPath "ChordPilot - Windows.lnk"
$legacyShortcutPath = Join-Path $repositoryRootPath "ChordPilot.lnk"
$iconPath = Join-Path $repositoryRootPath "build\icon.ico"

$executables = @(Get-ChildItem -LiteralPath $distPath -Filter "ChordPilot.exe" -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -like "win*-unpacked" } |
    Sort-Object LastWriteTimeUtc -Descending)

if ($executables.Count -eq 0) {
    throw "No unpacked Windows build was found under $distPath."
}

$executable = $executables[0]
$executableDirectory = Join-Path $distPath $executable.Directory.Name
$executablePath = Join-Path $executableDirectory "ChordPilot.exe"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executablePath
$shortcut.WorkingDirectory = $executableDirectory
$shortcut.Description = "Launch ChordPilot - Windows"
if (Test-Path -LiteralPath $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Save()

if (-not (Test-Path -LiteralPath $shortcutPath)) {
    throw "The Windows shortcut was not created at $shortcutPath."
}

if (Test-Path -LiteralPath $legacyShortcutPath) {
    Remove-Item -LiteralPath $legacyShortcutPath -Force
}

Write-Host "Created ChordPilot - Windows.lnk -> $executablePath"
