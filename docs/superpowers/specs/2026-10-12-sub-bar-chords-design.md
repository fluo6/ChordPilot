# Chord changes within musical bars

## Problem and evidence

The Waste Of Time session contains 109 bars, 4/4, 103 BPM, and a duration of 252.253 seconds. Its analysis uses the high-quality Other/Bass stem pipeline. Beat times are approximately 0.583 seconds apart; a bar spans approximately 2.33 seconds. `estimate_bars_from_audio` aggregates chroma across that whole interval, then assigns one chord. A finer beat grid alone cannot fix this because both the stored chart and consumers assume one chord per bar.

This inspection establishes the representation limitation. It does not establish the correct chords or change times in the recording; those require listening and finer audio analysis. The session reports fallback beat timing, so beat alignment must also be checked when assessing this example.

## Intended behavior

Represent multiple timed chords within each musical bar, while retaining measure numbers, sections, lyrics, repeats, and the existing song tempo grid. The user can let the analyzer choose changes automatically or request a fixed analysis grid. Each change remains editable and can open Local Study for closer inspection.

## Analysis settings

- Add **Chord timing**: Auto changes, Fixed grid, and Legacy one per bar.
- Add **Analysis grid** for Auto and Fixed modes: half bar, one beat, or half beat. One beat is the initial default. In 4/4 these offer two, four, or eight analysis cells per bar. Derive subdivisions from actual beat intervals rather than assuming a constant BPM where beat times exist.
- The grid is the finest analysis interval, not a forced chord change or a claim of exact onset detection. Initially, event boundaries stay on this grid. Audio-precise onset refinement is outside this first implementation.
- Auto analyzes short cells and retains changes supported by harmonic evidence, merging adjacent compatible estimates and suppressing isolated low-confidence flicker. Genuine brief changes must survive when evidence is strong. Define and test the merge rules during implementation; do not rely on a blanket minimum-duration filter.
- Fixed grid retains a result for each cell so the user can inspect the full detail. This provides a useful comparison when Auto merges too aggressively.
- Legacy preserves current analysis behavior for comparison. Existing saved charts remain readable without reanalysis.

## Backend and evidence

Reuse the existing chord candidate ranking and stem choices. Analyze Other/full mix and Bass over the same exact cell interval. Capture per-cell start/end, chord, confidence, alternatives, pitch evidence, and bass reference. Short windows must pad within the requested crop rather than consume neighboring audio. Neighbor context should resolve ambiguous cells without smoothing away clear changes.

Estimate the global key from duration-weighted evidence so partial cells and subdivisions do not disproportionately affect key estimation. Include timing mode/grid and a new algorithm version in cache identity. Preserve each original musical bar boundary and clip partial cells at bar/song boundaries.

## Chart data and compatibility

Add a `chord_events` list within each bar. Each event contains absolute original-audio `start` and `end` seconds plus its chord and evidence. Events cover the analyzed portion of the bar without overlap and remain ordered. Silence can be represented as N.C. rather than inventing a chord.

Keep `bar.chord` as a compatibility summary chosen from the longest-duration event, with the earliest event winning ties. Updated consumers must use events for timing and display. Older sessions without events are interpreted as one event covering their bar; loading does not rewrite the user's file.

## Renderer, editing, and export

Show successive chords inside one measure and align timeline blocks to event times. Playback highlights the active event. Selecting a chord displays that event's alternatives and evidence; chord corrections and transposition apply to event symbols. Dragging a chord boundary adjusts its time without renumbering musical bars.

Keep existing measure split/merge operations distinct from splitting/merging chord events. Preserve their timed events during measure edits. Opening Local Study from a chord uses its interval; the current-moment shortcut continues using its existing ±0.5-second window.

Update session save/load, text/CSV/JSON, chart renderers, and MusicXML to retain multiple chords and their timing. Exports must not quietly collapse events to the compatibility chord. Older charts export with their current behavior.

## Verification and rollout

Use synthetic audio with known changes at beats 1 and 3, every beat, and every half beat; sustained chords with moving melody; bass inversions; silence; and partial final bars. Verify Auto suppresses spurious fluctuations while preserving supported short changes, and Fixed exposes every requested cell.

Verify old session compatibility, event timing during playback and tempo previews, save/reopen, event corrections, transposition, bar edits, Local Study links, and multi-chord exports. Compare Legacy, Fixed, and Auto on this song using a short manually checked passage before claiming musical accuracy. Reanalysis produces a separate reviewable result and must preserve the original session and user corrections.

This is an architectural change across analysis, chart data, renderer, and exports. The next step after design approval is an implementation plan with staged delivery and explicit migration tests.
