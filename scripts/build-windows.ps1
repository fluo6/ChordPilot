[CmdletBinding()]
param(
    [ValidateSet("unpacked", "distribution")]
    [string]$Mode = "unpacked",

    [ValidateSet("x64", "arm64")]
    [string]$Architecture = "x64",

    [switch]$InstallDependencies
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    throw "The Windows build script must run on Windows."
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

Push-Location $repositoryRoot
try {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd is not available on PATH. Install Node.js first."
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "node is not available on PATH. Install Node.js first."
    }

    if ($InstallDependencies -or -not (Test-Path -LiteralPath "node_modules\electron-builder")) {
        Invoke-Checked npm.cmd ci
    }

    $npmScript = if ($Mode -eq "distribution") { "dist:win" } else { "build:win" }
    Invoke-Checked npm.cmd run $npmScript -- "--$Architecture"
    Invoke-Checked node scripts/packaging/verify-build.mjs "--platform=win32" "--architecture=$Architecture" "--mode=$Mode"

    Write-Host ""
    Write-Host "Windows $Mode build completed and verified for $Architecture." -ForegroundColor Green
}
finally {
    Pop-Location
}
