[CmdletBinding()]
param(
    [string]$RemoteUrl = "https://github.com/fiuo6/ChordPilot.git",
    [int]$MaximumFileSizeMiB = 50
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$maximumFileSizeBytes = $MaximumFileSizeMiB * 1MB

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

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

function Get-StagedPaths {
    $paths = @(& git diff --cached --name-only --diff-filter=ACMR)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read the staged file list."
    }
    return @($paths | Where-Object { $_ })
}

Push-Location $repositoryRoot
try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is not available on PATH. Install Git for Windows, then rerun this script."
    }

    $repositoryProbe = Invoke-GitProbe rev-parse --is-inside-work-tree
    $isRepository = $repositoryProbe.ExitCode -eq 0

    if (-not $isRepository) {
        $gitDirectory = Join-Path $repositoryRoot ".git"
        if (Test-Path -LiteralPath $gitDirectory) {
            $gitItems = @(Get-ChildItem -LiteralPath $gitDirectory -Force)
            if ($gitItems.Count -gt 0) {
                throw "The .git directory is not empty but is not a valid repository. Stop and recover it manually; this script will not overwrite it."
            }
        }

        Invoke-Git init -b main
    }

    $headProbe = Invoke-GitProbe rev-parse --verify HEAD
    if ($headProbe.ExitCode -eq 0) {
        throw "This repository already has commits. The initial-import scripts deliberately stop to avoid rewriting existing history."
    }

    $branchName = (& git symbolic-ref --quiet --short HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not determine the current branch."
    }
    if ($branchName -ne "main") {
        Invoke-Git branch -M main
    }

    $remoteProbe = Invoke-GitProbe remote get-url origin
    if ($remoteProbe.ExitCode -eq 0) {
        $existingRemote = ($remoteProbe.Output -join "`n")
        if ($existingRemote.TrimEnd('/') -ne $RemoteUrl.TrimEnd('/')) {
            throw "origin already points to '$existingRemote'. Expected '$RemoteUrl'. Correct it manually or rerun with -RemoteUrl."
        }
    }
    else {
        Invoke-Git remote add origin $RemoteUrl
    }

    $pathsToStage = @(
        ".gitignore",
        "README.md",
        "package.json",
        "package-lock.json",
        "src",
        "backend",
        "scripts"
    )

    foreach ($path in $pathsToStage) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Required import path is missing: $path"
        }
        Invoke-Git add -- $path
    }

    if (Test-Path -LiteralPath "build\icon.ico") {
        Invoke-Git add -f -- "build/icon.ico"
    }

    $stagedPaths = Get-StagedPaths
    if ($stagedPaths.Count -eq 0) {
        throw "No files were staged."
    }

    $forbiddenPatterns = @(
        "^(node_modules|dist|Tools|\.agents|\.codex)/",
        "(^|/)\.env($|\.)",
        "\.lnk$"
    )
    $forbiddenPaths = @($stagedPaths | Where-Object {
        $path = $_
        $forbiddenPatterns | Where-Object { $path -match $_ }
    })
    if ($forbiddenPaths.Count -gt 0) {
        throw "Unsafe paths were staged unexpectedly:`n$($forbiddenPaths -join "`n")"
    }

    $largePaths = foreach ($path in $stagedPaths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $item = Get-Item -LiteralPath $path
            if ($item.Length -gt $maximumFileSizeBytes) {
                "{0} ({1:N1} MiB)" -f $path, ($item.Length / 1MB)
            }
        }
    }
    if (@($largePaths).Count -gt 0) {
        throw "Files larger than $MaximumFileSizeMiB MiB were staged. Review or manage them with Git LFS:`n$($largePaths -join "`n")"
    }

    Write-Host ""
    Write-Host "Initial import prepared. Nothing has been committed or pushed." -ForegroundColor Green
    Write-Host ""
    Invoke-Git status --short --branch
    Write-Host ""
    Invoke-Git diff --cached --stat
    Write-Host ""
    Write-Host "Review the staged files with:" -ForegroundColor Cyan
    Write-Host "  git diff --cached --name-only"
    Write-Host "  git diff --cached"
    Write-Host ""
    Write-Host "When satisfied, run scripts\github\02-commit-initial-import.ps1"
}
finally {
    Pop-Location
}
