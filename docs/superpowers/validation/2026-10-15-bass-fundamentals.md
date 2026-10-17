# Bass fundamentals and Gravity reference

Reference: [BasscoverPete — John Mayer, Gravity bass cover / score / TAB](https://www.youtube.com/watch?v=JF-79DoNNOU). The downloaded recording, separated htdemucs stems, diagnostic frames, baseline estimator and reports are local ignored files under `.chordpilot-data/benchmarks/gravity/`; media is not added to Git.

The checked fixture is `tests/fixtures/chord-references/gravity.json`: 43 sampled bass pitches and 16 chord windows. These are manual readings of the video's TAB and moving highlight, not a complete authoritative transcription. Eight samples lie at attacks or transitions; their highlight can precede a stable audible pitch. They are reported separately from the 35 note interiors. Bass sounds one octave below its staff notation. The source is in 6/8; automatic meter detection remains outside this change (the production HQ grid still assumes 4/4). The UI preview uses manually aligned reference bars and must not be mistaken for a validated automatic transcription.

## Changes

- Replaced low-frequency spectral pitch-class voting with a shared YIN-style monophonic fundamental tracker for the separated Bass stem. A strong third partial can no longer win merely by being louder than the root. Weak/missing fundamentals, genuine octave jumps and out-of-range upper bleed have dedicated synthetic regressions.
- Uses 120 ms centered frames at 20 ms intervals, at least 80% periodicity, and tuning within 40 cents. A longer integral period needs a substantially better difference minimum and spectral support from its root or both second and third partials. Equal repeating minima of a pure tone do not justify inventing a lower octave.
- Rejects isolated 20 ms estimates. Noise floor is `max(0.0001 RMS, 0.005 × 95th-percentile 120 ms frame RMS)` in the analyzed audio. This removes very quiet periodic intro/outro recording noise.
- Omits brief neighboring-pitch release artifacts: runs under 100 ms, within two semitones of the preceding run and separated by under 80 ms, where following 60 ms RMS is below 70% of preceding 60 ms RMS and the maximum intervening 20 ms RMS is below 125% of the preceding level. It leaves gaps, rather than inventing held notes. Quiet legato chromatic notes can still be missed.
- Stores independent `bass_events` with sounding MIDI, measured frequency, confidence and start/end. Fretboard, score and TAB use these timings independently of chord-grid cells. Reading the complete saved track preserves notes after bar-start edits. Older sessions retain their legacy cell preview until reanalysis.
- Chord cells, grouped chords, root-change refinement and Local Study consume the same fundamental evidence. Raw spectral peaks remain separate, so the original spectrum can still show physical harmonics without treating every partial as a played bass note in the keyboard.
- Analysis/study cache identities advanced. Help explains the estimator and its limits. Reanalyse Chords uses existing stems; fresh separation is unnecessary.

Method background: the [librosa fundamental-frequency tutorial](https://librosa.org/doc/dev/auto_tutorials/01-intro/03-f0.html) explains periodicity-based f0 estimation, monophonic-source assumptions and YIN's silence/continuity limitations. The implementation uses existing NumPy/SciPy, not librosa or a new model. The local installed librosa/Numba combination cannot import; no global packages were replaced.

## Measurements

On the 35 stable sampled Gravity bass notes, both the baseline and new detector match all 35 sounding MIDI notes. This recording's sustained bass already had strong fundamental evidence. The improvement is robustness and finer timing, not a claimed increase from an already perfect sustained-note sample score.

At the eight attack/highlight samples, the old selected-range detector gives one correct octave and seven wrong octaves/pitches. The new selected-range detector gives two correct, one wrong and five unvoiced results. The continuous track gives one wrong and seven unvoiced results at those exact instants. Abstention is counted explicitly, not credited as a correct note. These samples illustrate the timing/recall tradeoff; they do not establish full-song transcription accuracy.

The real release near 14.4–14.7 s produced brief F/F# estimates while a G string decayed without a new attack. The release filter removes that cluster. It retains D2 at approximately 15.05–15.17 s and C#2 at 18.02–18.08 s. A browser check at 15.14 s shows D2 active on the fretboard, score and TAB, with the rest of the bar's G1 positions retained. Screenshot: `.chordpilot-data/benchmarks/gravity/bass-preview.png`.

Gravity chord results remain 11/16 root matches and 8/16 function matches on the checked windows. Some major passages are still labelled as related minor slash chords (for example Em9/G rather than a G-family reading). Extensions and chord functions are not forced to match a chart by overriding the measured bass or hardcoding the song.

Previous-song checks retain Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4, and Ballad's C13, with tail reduction both off and at 20%. Ballad bars 5–8 remain Fmaj9. Overjoyed retains 18/21 local root and 12/21 local function matches. Timed Overjoyed results and any tradeoffs are recorded in `report-bass-f0.json`; reference root-boundary matches depend on the chord root label as well as timing, so a related minor slash reading does not count as the same root.

On Overjoyed's timed reference, root agreement changes from 88.36% to 88.13%, function agreement from 50.61% to 51.27%, and root-boundary matches from 17/20 to 15/20. The two lost matches surround a Db passage now named Bbmadd9/Db; the bass transition itself is present. This is a remaining chord-root naming tradeoff, not a claim that all previous output is unchanged. No general root-preference scoring rule was retuned to hide it.

## Reproduce

Run `scripts/testing/chord-reference-benchmark.py` with `--audio`, `--other`, `--bass`, `--reference tests/fixtures/chord-references/gravity.json` and `--output <report.json>`. Gravity's bass points automatically add octave/error/unvoiced statistics and saved note events. Run without `--timed` for this fixture: its chord windows do not claim an automatically checked meter/grid.

Python regressions cover harmonic confusion, missing fundamentals, upper-register bleed, pure tones, noise, release glides, fresh chromatic attacks, octave jumps, rests, exact cropping and independent bar timing. JavaScript regressions cover legacy sessions, explicit fundamental octaves, short-note highlighting, 4/5-string positions and edited bar/chord boundaries.

The complete `npm test` invocation still encounters two established Windows/environment failures: `environment defaults parse without starting the HTTP server` expects Unix executable defaults instead of Windows/bundled ffmpeg, and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails` exits at Node's blocked port 1 before its injected cleanup case. These are unrelated to bass processing. The remaining JavaScript suite and the complete Python suite are run separately.

Final verification: 151 Python tests passed; 281 JavaScript tests passed with those two established cases excluded. The unrestricted project invocation reports 281 passed and those same two failed. An independent code review confirmed the final upper-bleed guard and the shared study/group/UI integration fixes.
