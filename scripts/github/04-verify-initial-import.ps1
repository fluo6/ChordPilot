[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

Push-Location $repositoryRoot
try {
    & git fetch origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Could not fetch origin/main. Check authentication and the remote URL."
    }

    $localCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve the local HEAD commit."
    }
    $remoteCommit = (& git rev-parse origin/main).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve origin/main."
    }

    if ($localCommit -ne $remoteCommit) {
        throw "Local main and origin/main do not match.`nLocal:  $localCommit`nRemote: $remoteCommit"
    }

    & git status --short --branch
    & git log -1 --oneline --decorate
    Write-Host ""
    Write-Host "Verified: local main and origin/main point to the same commit." -ForegroundColor Green
    Write-Host "Confirm the Protect main ruleset is ACTIVE before making further changes." -ForegroundColor Yellow
}
finally {
    Pop-Location
}
