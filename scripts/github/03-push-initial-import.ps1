[CmdletBinding()]
param(
    [string]$RemoteUrl = "https://github.com/fiuo6/ChordPilot.git",
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

Push-Location $repositoryRoot
try {
    $branchName = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branchName -ne "main") {
        throw "The current branch must be main. Current branch: '$branchName'."
    }

    & git rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "No initial commit exists. Run 02-commit-initial-import.ps1 first."
    }

    $existingRemote = & git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "The origin remote is missing. Run 01-prepare-initial-import.ps1 first."
    }
    if ($existingRemote.TrimEnd('/') -ne $RemoteUrl.TrimEnd('/')) {
        throw "origin points to '$existingRemote', not '$RemoteUrl'. Stop and correct the remote before pushing."
    }

    $stagedChanges = @(& git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0 -or @($stagedChanges | Where-Object { $_ }).Count -gt 0) {
        throw "There are staged changes after the initial commit. Review them before pushing."
    }

    & git status --short --branch
    if ($LASTEXITCODE -ne 0) {
        throw "Could not display repository status."
    }
    Write-Host ""
    & git log -1 --oneline --decorate

    if (-not $Yes) {
        Write-Host ""
        Write-Host "The GitHub Protect main ruleset must be temporarily DISABLED." -ForegroundColor Yellow
        $confirmation = Read-Host "Type PUSH to publish this initial main branch"
        if ($confirmation -cne "PUSH") {
            throw "Push cancelled."
        }
    }

    & git push -u origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Push failed. If GitHub rejected it because of repository rules, disable the ruleset temporarily and rerun this script."
    }

    Write-Host ""
    Write-Host "Initial main branch pushed successfully." -ForegroundColor Green
    Write-Host "Re-enable the Protect main ruleset now, then run scripts\github\04-verify-initial-import.ps1" -ForegroundColor Yellow
}
finally {
    Pop-Location
}
