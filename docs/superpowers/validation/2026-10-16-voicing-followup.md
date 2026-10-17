# Voicing follow-up: real-recording abstention audit

The four current subtitles (quartal, So What shape, drop-2, drop-3) were audited on the five existing real-recording reference sets. This is a Local Study window audit of the current snapshot extractor and renderer classifier. It does not establish voicing precision: the reference fixtures check chord names and approximate times, not simultaneous played pitches and octaves.

Run `node scripts/testing/voicing-reference-audit.js --fresh` from the repository root with `PYTHON` set to an interpreter containing the analysis dependencies (for example, `$env:PYTHON = 'C:\Python39\python.exe'` in PowerShell on the validation machine). The script reads the existing local audio and Demucs `other`/`bass` stems, analyzes each fixture window with its recorded settings, and passes each window's snapshots to `chordVoicing` with both the detected chord and the fixture chord. It writes no audio, session, fixture or report files. Without `--fresh`, it audits the older saved snapshot probe for comparison.

| Recording | Windows | Snapshots | Nonempty snapshots | Windows with any pitch snapshot | Labels with detected / reference chord |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hero | 20 | 137 | 15 | 11 | 0 / 0 |
| Virtual Insanity | 13 | 54 | 4 | 4 | 0 / 0 |
| Gravity | 16 | 89 | 17 | 10 | 0 / 0 |
| Overjoyed | 21 | 188 | 2 | 2 | 0 / 0 |
| September | 13 | 4 | 0 | 0 | 0 / 0 |
| **Total** | **83** | **472** | **38** | **27** | **0 / 0** |

Thus the subtitle abstained in 83/83 sampled windows, including all 70 windows with at least two snapshots and 27 with at least one nonempty pitch snapshot. This measures coverage on selected windows, not an accuracy rate over complete recordings. Some September windows are shorter than the extractor's 320 ms minimum. Most other snapshots are empty under its pitch, persistence and overtone checks; a single nonempty snapshot is also insufficient for a subtitle, which requires two matches and 60% of all sampled slices. The prior saved probe also yielded 0/83 labels, though its snapshot counts differ because the extractor changed after that probe was generated.

There are **zero observed positive claims** in these windows. Therefore the number of observed false-positive labels is zero, but false-positive *precision or rate is undefined*. The fixtures cannot tell us how many genuine voicings were missed, either. Neither a chord label nor a spectral pitch peak proves a played, simultaneous note at a specific octave. The existing synthetic tests cover sustained shapes, extra doublings and repeated arpeggios; they cannot substitute for manually checked recording examples with reverb and dense mixtures. The audit does not cover all Beat Detail event boundaries, whose grouping may differ from these selected Local Study windows.

## Decision on remaining items

- **VOI-01 remains open.** Independently check exact accompaniment pitches, octaves and temporal overlap in recordings, then score nonabstaining labels as correct, incorrect or indeterminate. Include positive examples of each of the four shapes and negative examples with reverb, dense mixes, doublings and fast repeated arpeggios. The present sample has no positive label on which to estimate precision.
- **VOI-03 remains open.** The current extractor deliberately returns only three to five notes per snapshot, so two-note root+third or root+seventh/sixth shells cannot reach the renderer. A three-note root/guide-tone set can also mix instruments or reflect a chord with weak unmeasured voices. No shell label was added without a checked register and source-allocation corpus. A shell name must describe observed accompaniment, not infer a pianist's hands or borrow the independent bass stem as an accompaniment root.
- **VOI-04 remains open.** Drop-2+4 can be defined by exact four-voice octave displacement, but close/four-way close, open/spread and stacked-thirds names overlap broad families of chord-compatible sets. Upper-structure triads need separate lower and upper layers; the Kenny Barron label needs a verified specific interval/register example. With the current four labels abstaining throughout this reference sample, expanding the label set would create unmeasured positive claims. No additional shape was added.

For the next validation pass, annotate time-bounded `other`-stem examples with independently checked MIDI pitches and octaves, mark whether each voice overlaps through the 320 ms snapshot, and flag leakage, overtones or ambiguous reverb as indeterminate. Keep separate annotations for an independently played bass line and for chart harmony. Include clear positives and hard negatives from sources outside these five tuning references. Run the classifier without looking at its labels during annotation; report precision among labels, abstentions among eligible examples, and examples excluded as indeterminate. Only then set thresholds or add families.
