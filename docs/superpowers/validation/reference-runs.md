# Reproducing chord and bass reference runs

The committed labels live in `tests/fixtures/chord-references/*.json`. Each fixture records its source URL, time windows, analysis settings and label uncertainty. They are selected checks, not whole-song ground truth. The benchmark writes its algorithm version and settings into each report. Keep older reports as dated snapshots and link to a newer result when behavior changes.

The audio and Demucs stems are **not** committed. On this machine they live under `.chordpilot-data/benchmarks/<case>/`; an equivalent media root can be used elsewhere. Prepare the matching audio segment from the fixture's source and htdemucs `other`, `bass` and `drums` stems first. The `stems.json` manifest is generated locally and contains absolute paths, so paths may need updating after moving a checkout.

| Case | Audio under its media directory | Reference | Coverage caveat |
| --- | --- | --- | --- |
| `hero` | `reference-95s.wav` | `hero.json` | First 95 s; score highlights are approximate and intro unscored. |
| `virtual-insanity` | `reference-95s.wav` | `virtual-insanity.json` | First 95 s; fermata and later 2/4 bars are not validated by automatic 4/4 grouping. |
| `gravity` | `gravity.wav` | `gravity.json` | Sampled bass TAB points and chord windows. |
| `overjoyed` | `intro-65s.wav` | `overjoyed.json` | Selected first 65 s windows. |
| `september` | `september.wav` | `september.json` | Static-page transcription, approximate alignment. |

From the repository root in PowerShell, run one case as follows. Change `$case` and `$audioName` using the table. Set `$python` to the interpreter with NumPy/SciPy, soundfile and the other ChordPilot analysis dependencies installed.

```powershell
$python = "C:\Python39\python.exe"
$case = "virtual-insanity"
$audioName = "reference-95s.wav"
$media = Join-Path ".chordpilot-data/benchmarks" $case
$stems = (Get-Content (Join-Path $media "stems.json") -Raw | ConvertFrom-Json).stems
$other = ($stems | Where-Object name -eq "other").path
$bass = ($stems | Where-Object name -eq "bass").path
$drums = ($stems | Where-Object name -eq "drums").path
New-Item -ItemType Directory -Force ".chordpilot-data/benchmarks/reference-reports" | Out-Null
& $python scripts/testing/chord-reference-benchmark.py `
  --audio (Join-Path $media $audioName) --other $other --bass $bass --drums $drums `
  --reference "tests/fixtures/chord-references/$case.json" `
  --output ".chordpilot-data/benchmarks/reference-reports/$case.json" --timed
```

Omit `--timed --drums $drums` for the quicker Local Study window comparison. The report contains each detected chord and root/function/exact agreement; timed mode also compares beat-grid overlap and boundary changes. `bass_points` and rejection windows are checked when present. Compare the report against [the dated current baseline](../../../TODO.md#reference-baseline), not an old narrative report with a different vocabulary or fixture count. Run the Python and JS unit suites with `npm test` when changing recognition code.

Avoid using these fixtures to tune a threshold and then claiming their score is held-out accuracy. Record both wins and losses, and use new verified songs and attacks to assess generalization.
