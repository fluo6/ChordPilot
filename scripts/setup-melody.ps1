param(
    [string]$Python = 'py',
    [switch]$AcceptNonCommercialWeights
)
$ErrorActionPreference = 'Stop'
if (-not $AcceptNonCommercialWeights) {
    throw 'GAME weights use CC BY-NC-SA 4.0. Read docs/melody-analysis.md, then pass -AcceptNonCommercialWeights for the optional local install.'
}
$melodyRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.tool-cache/melody'
New-Item -ItemType Directory -Force -Path $melodyRoot | Out-Null
$melodyVenv = Join-Path $melodyRoot 'venv'
$melodyPython = Join-Path $melodyVenv 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $melodyPython)) {
    if ($Python -eq 'py') { & $Python -3.12 -m venv $melodyVenv }
    else { & $Python -m venv $melodyVenv }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the optional environment. Supply a standard Python 3.12 executable with -Python.' }
}
function Install-MelodyArchive([string]$Url, [string]$Name, [string]$Sha256, [string]$Destination) {
    $archive = Join-Path $melodyRoot $Name
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $Url -OutFile $archive }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Checksum mismatch for $Name. Remove that archive and retry. Existing source and weights were preserved."
    }
    if (-not (Test-Path -LiteralPath $Destination)) { Expand-Archive -LiteralPath $archive -DestinationPath $Destination }
}
Install-MelodyArchive 'https://codeload.github.com/openvpi/GAME/zip/refs/tags/v1.0.3' 'game-source.zip' 'CE1D19ED2D053BA1D9903C944C5F54446731C8E0F6D0D85D8929D6CF88B4AD65' (Join-Path $melodyRoot 'source-download')
# Keep the downloaded folder at the backend's documented default location.
$melodySource = Join-Path $melodyRoot 'GAME-1.0.3'
if (-not (Test-Path -LiteralPath $melodySource)) {
    # Exact children of this task's cache root; no recursive/computed deletion.
    Copy-Item -LiteralPath (Join-Path $melodyRoot 'source-download/GAME-1.0.3') -Destination $melodySource -Recurse
}
Install-MelodyArchive 'https://github.com/openvpi/GAME/releases/download/v1.0.0/GAME-1.0-small.zip' 'game-small.zip' '3D3E1AC0A83234B2A163A3D43043455D15670765EAA25EF6285C399DA1CCC576' (Join-Path $melodyRoot 'game-small')
& $melodyPython -m pip install 'torch>=2.1' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'Optional CPU PyTorch installation failed.' }
& $melodyPython -m pip install 'numpy<2' 'scipy>=1.10' 'librosa==0.11.0' soundfile 'pydantic>=2.11,<3' einops PyYAML
if ($LASTEXITCODE -ne 0) { throw 'Optional melody dependencies could not be installed.' }
Write-Output 'Optional GAME installation complete. Restart ChordPilot, prepare vocals if necessary, then select Analyse Melody.'
