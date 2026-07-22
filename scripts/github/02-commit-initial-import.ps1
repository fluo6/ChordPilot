[CmdletBinding()]
param(
    [string]$Message = "Initial import of ChordPilot",
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

function Invoke-GitProbe {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        $output = @(& git @Arguments 2>$null)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

Push-Location $repositoryRoot
try {
    $repositoryProbe = Invoke-GitProbe rev-parse --is-inside-work-tree
    if ($repositoryProbe.ExitCode -ne 0) {
        throw "This is not a valid Git repository. Run 01-prepare-initial-import.ps1 first."
    }

    $headProbe = Invoke-GitProbe rev-parse --verify HEAD
    if ($headProbe.ExitCode -eq 0) {
        throw "The repository already has commits. This script will not create another initial commit."
    }

    $stagedPaths = @(& git diff --cached --name-only --diff-filter=ACMR)
    if ($LASTEXITCODE -ne 0 -or @($stagedPaths | Where-Object { $_ }).Count -eq 0) {
        throw "No files are staged. Run 01-prepare-initial-import.ps1 first."
    }

    & git status --short --branch
    if ($LASTEXITCODE -ne 0) {
        throw "Could not display repository status."
    }
    Write-Host ""
    & git diff --cached --stat
    if ($LASTEXITCODE -ne 0) {
        throw "Could not display the staged diff summary."
    }

    if (-not $Yes) {
        Write-Host ""
        $confirmation = Read-Host "Type COMMIT to create the initial commit"
        if ($confirmation -cne "COMMIT") {
            throw "Commit cancelled."
        }
    }

    & git commit -m $Message
    if ($LASTEXITCODE -ne 0) {
        throw "Initial commit failed."
    }

    Write-Host ""
    Write-Host "Initial commit created. Nothing has been pushed." -ForegroundColor Green
    & git log -1 --oneline --decorate
    Write-Host ""
    Write-Host "Disable the GitHub ruleset temporarily, then run scripts\github\03-push-initial-import.ps1"
}
finally {
    Pop-Location
}
