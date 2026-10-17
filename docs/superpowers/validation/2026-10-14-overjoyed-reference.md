# Overjoyed video reference benchmark

Source: [Overjoyed by Stevie Wonder — Chords at MyPartitur](https://www.youtube.com/watch?v=SiC6zQBONUM). The displayed transcription and moving bar highlight provide a useful comparison, rather than an authoritative account of every performed note. The chart starts Db6 → C7 → Bmaj7 → C7; its A section includes Ebmaj7 → Cm7 → Fm7 → Bb7.

The checked reference is `tests/fixtures/chord-references/overjoyed.json`. It records the first 16 bars, 21 interior chord windows and approximate bar boundaries. The first 65 seconds were separated locally with cached htdemucs on GPU. Audio, stems, source frames and diagnostic reports remain under ignored `.chordpilot-data/benchmarks/overjoyed/`; they are not repository assets. The session JSON files for the earlier songs were not changed.

## Reference timing and metrics

Highlight transitions were extracted at 10 frames per second. The first highlight appears at 1.5 s, after the first audio harmony starts around 0.75 s. Later highlights are manually advanced and have smaller offsets. Two-chord bars assume equal half-bar placement. Windows exclude 0.25 s on each side, and boundary errors must be interpreted with these uncertainties.

Settings: known key Eb, Auto changes, Half beat, Sustained, 20% tail reduction, 0.5 s half-life, 0% overtone weighting, Bass + Other for Local Study. Timed evaluation calls the same high-quality analysis entry point as the application, including automatic key estimation when a reference leaves the key unspecified. No reference chord or boundary is passed to recognition.

Root agreement compares harmonic roots, not slash bass notes. Function agreement additionally compares third, seventh and suspension. It permits added extensions with the same function (C7 versus C9/C13), but distinguishes C7 from Cmaj7 or a suspension. It does not measure exact extensions, sixth voicings or inversions. Timed scores weight matching duration inside the same interior windows. Boundary comparisons match the from/to root pair within one detected beat and consume each detected change at most once.

| Metric | Before | After |
| --- | ---: | ---: |
| Local root agreement | 17/21 | 18/21 |
| Local function agreement | 9/21 | 12/21 |
| Timed root agreement | 83.4% | 88.4% |
| Timed function agreement | 41.3% | 50.6% |
| Reference root transitions matched | 13/20 | 17/20 |

The product detected 83 BPM. For the 17 matched transitions, absolute differences from approximate reference marks range from 0.00 to 0.30 s. Missing transitions and extra short labels remain; these scores do not establish exact timing accuracy or general song accuracy.

## Shared scorer change

A seventh voicing with a weak perfect fifth could lose to an upper-triad slash chord or unsupported suspension, even when the measured third and seventh were clear. The shared scorer now accepts an omitted perfect fifth when those two independently measured guide tones each reach 6% of normalized chroma. The seventh replaces the fifth in essential-tone scoring while the fifth remains below the existing 4.5% scoring threshold. Fifth strength uses the same bass-blended evidence as the essential-tone penalty; the guide tones still use accompaniment evidence before bass injection.

This improves Bmaj7 at 3.95–4.85 s and C9 at 2.475–3.45 s and 8.20–9.15 s. It applies in every key, in both Local Study and song analysis. Sixth chords, altered fifths and suspended chords retain their ordinary requirements. The established dominant-13 rule remains separate. PyChord supplies the existing formulas; none were changed for this song.

An initial sixth-voicing variant replaced Ballad's supported C13 passage with C6, so sixth support was removed. Longer FFT windows, peak-only chroma and expanded overtone subtraction gave mixed results on this reference and were not applied. Cache identities advance to `sub-bar-v6` and `local-study-v13`. Existing results require **Reanalyse Chords**; cached stems can be reused.

## Remaining mismatches

| Interior window (s) | Reference | Before | After |
| --- | --- | --- | --- |
| 1.00–1.975 | Db6 | Bbmadd9/C# | Bbmadd9/C# |
| 2.475–3.45 | C7 | C9sus4 | C9 |
| 3.95–4.85 | Bmaj7 | Abmadd9/B | Bmaj7 |
| 5.35–6.25 | C7 | C7 | C7 |
| 6.75–7.70 | Db6 | C#13 | C#13 |
| 8.20–9.15 | C7 | C9sus4 | C9 |
| 9.65–10.60 | Bmaj7 | C#13/B | C#13/B |
| 11.10–12.05 | Bb7 | Bbmaj7 | Bbmaj7 |
| 12.55–15.05 | Ebmaj7 | Ebmaj9 | Ebmaj9 |
| 15.55–17.95 | Cm7 | Cm9 | Cm9 |
| 18.45–20.85 | Fm7 | Fm11 | Fm11 |
| 21.35–23.85 | Bb7 | Bbmaj9 | Bbmaj9 |
| 24.35–26.55 | Ebmaj7 | F13/Eb | F13/Eb |
| 27.05–29.45 | Cm7 | Cm9 | Cm9 |
| 29.95–32.55 | F/A | Fadd9/A | Fadd9/A |
| 33.05–35.35 | G/B | Gmaj9/B | Gmaj9/B |
| 35.85–38.25 | Cmaj7 | Cadd9 | Cadd9 |
| 38.75–41.15 | G/B | Gmaj9/B | Gmaj9/B |
| 41.65–42.60 | Cm7 | Cm9 | Cm9 |
| 43.10–44.05 | F7 | F9 | F9 |
| 44.55–46.85 | Bb7 | Bb9 | Bb9 |

Db6 root interpretation, the second Bmaj7, false major sevenths over Bb/G and the Cmaj7 missing seventh remain useful calibration cases. The chart alone cannot decide whether every detected extension is played, melodic spill or an overtone. Timing refinement and note-versus-overtone discrimination remain separate problems.

## Compatibility and verification

- Weak-fifth guide-tone regressions cover all twelve keys. Increasing fifth evidence at the threshold originally restored the wrong Bmaj7 alternative; the boundary regression now passes.
- Independent review found and checked the fifth-threshold mismatch, automatic-key benchmark path and duplicate boundary matching. Standard inversion regressions pass; ambiguous equivalent voicings are not treated as authoritative failures.
- Waste Of Time, Bass + Other, both 0% and 20% tail, 0% overtone: 0.260–1.489 s remains Abmaj9; 56.260–57.260 s remains Eb7#9; 94.624–95.541 s remains Eb9sus4.
- Ballad, local 3.410–4.870 s, key F, both tail settings, 0% overtone: C13. At 144 BPM on the full drum-derived grid (first beat 0.072 s), One beat/Sustained/20% tail retains Gm9 until 3.406 s, C13 until 5.072 s, C6 until 6.739 s, then Fmaj9. Dominant bar labels 5–8 remain Fmaj9. This matches the pre-change timeline.
- Full Python suite: 137 passed. JavaScript suite: 261 passed, with the same two established exclusions. The Windows sandbox blocked temporary executable renames in an initial JS run; the rerun outside that sandbox passed. `git diff --check` passed.

## Reproduction

Use the retained local stems (or prepare equivalent htdemucs stems for the first 65 s). From the repository root in PowerShell:

```powershell
$benchmarkRoot = Join-Path (Get-Location) '.chordpilot-data/benchmarks/overjoyed'
$benchmarkStems = (Get-Content (Join-Path $benchmarkRoot 'stems.json') -Raw | ConvertFrom-Json).stems
$referenceArgs = @(
  '--audio', (Join-Path $benchmarkRoot 'intro-65s.wav'),
  '--other', ($benchmarkStems | Where-Object name -eq 'other').path,
  '--bass', ($benchmarkStems | Where-Object name -eq 'bass').path,
  '--drums', ($benchmarkStems | Where-Object name -eq 'drums').path,
  '--reference', 'tests/fixtures/chord-references/overjoyed.json',
  '--output', (Join-Path $benchmarkRoot 'report-tuned.json'),
  '--timed'
)
& C:/Python39/python.exe scripts/testing/chord-reference-benchmark.py @referenceArgs
```

The runner also accepts other manually checked references with the same JSON structure. Download and separation are deliberately separate from recognition scoring, so repeated comparisons reuse identical input audio.
