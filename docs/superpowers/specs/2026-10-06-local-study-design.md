# ChordPilot Local Study Design

**Date:** 2026-10-06
**Status:** Implemented on 2026-10-06; automated and browser checks recorded in the validation document. Native desktop playback remains manually unverified.

## Purpose and success criteria

Help a musician inspect the harmony of a short passage independently of the
song's bar grid. The user selects exact start and end times, chooses which
stems to examine, receives a chord suggestion and note evidence, and saves
the passage as a study they can revisit. Saved results and optional corrected
chords also provide examples for evaluating future detection changes.

The agreed scope is a Local Study tab, Ctrl-click selection with a visible
alternative, Bass + Other selected by default, selection playback and looping,
chord alternatives and piano evidence, studies stored with the song's session,
and preserved results when reanalyzing. Desktop and LAN browser runtimes use
the same workflow.

Success means a user can select a passage that crosses bar boundaries,
analyze only that passage, save it, reopen the session, and recover both the
selection and its original result. A later run can be compared with that
result without changing the song's chart.

## Approach and scope

Use a dedicated editor panel alongside Song, Analysis, Log, and Table. Reuse
the existing waveform, playback, piano evidence, Python chord ranking, shared
runtime service, and session infrastructure. Add one range-analysis operation
and one renderer module for study state and interactions.

An Arrangement-only tool would require less UI but would make saved studies
and run comparisons harder to find. A separate application or global study
database adds storage and navigation work without serving this initial flow.

The initial feature returns one best chord for the entire selection, along
with alternatives. Automatic chord-change segmentation, octave-specific note
transcription, algorithm parameter optimization, standalone clip export, and
a global cross-song study library are outside this scope. Users can create
smaller studies when a passage contains several chords.

## Selection and navigation

- Local Study opens for the current song and displays its waveform, a time
  ruler, range inputs, stem choices, playback controls, result area, and saved
  study list. It uses the source duration and existing waveform data; it does
  not require a completed chord chart for full-mix studies.
- Holding Ctrl while clicking the waveform sets the first endpoint; another
  Ctrl-click sets the second. The two times are ordered automatically. A
  completed selection is shaded and labeled. The next Ctrl-click begins a
  new selection. Modifier selection is handled before normal seeking or bar
  selection. On macOS, Command-click is accepted as an equivalent shortcut.
- A visible Select Range toggle provides the same two-click behavior without
  a modifier. Start and End fields, in seconds with millisecond precision,
  are editable by keyboard. Existing zoom and scrolling conventions apply.
- Ctrl-click selection is also available on Arrangement waveform lanes.
  Completing a selection opens Local Study with those times. Ordinary clicks
  retain existing seeking and bar-selection behavior. Lane controls do not
  create selection points.
- Endpoints refer to original source seconds and do not snap to bars or
  beats. They must be finite, satisfy `0 <= start < end <= duration`, and span
  at least 0.05 seconds. No additional hard maximum is imposed.
- An incomplete or invalid range cannot be analyzed or played as a loop.
  Escape cancels an unfinished selection. Range errors appear near the fields.
- Editing the range or stems marks an existing displayed result as belonging
  to its previous inputs until a new run succeeds; evidence is never silently
  presented as the result of different inputs.

## Stem choices and listening

Default to Bass + Other when both are available. Other available stems,
including vocals and drums, are selectable. Full Mix is an explicit,
mutually exclusive alternative to selecting individual stems, preventing
double-counting the same audio. At least one source must be selected.

If stems are unavailable, show the requested defaults as unavailable and
explain that stem separation must be run through the existing high-quality
analysis workflow. Offer Use Full Mix explicitly. Do not silently substitute
the original mix or start downloading models or separating the entire song.
If a selected stem is missing, block that analysis and identify the stem.

Play Selection starts at the range start and stops at its end; Loop Selection
repeats the range until stopped. Playback uses the selected sources and the
existing master volume and playback speed controls. Pausing, leaving the
study tab, or switching songs stops the study loop and releases its playback
state. Stem choices for study analysis do not overwrite the Arrangement mix.

Study analysis and its listening preview use original, untransposed source
audio and stems. Chart transposition and generated pitch-shift previews do
not change study evidence. Display Original audio near the controls. This
keeps saved results reproducible and source timestamps meaningful.

## Range-analysis contract and algorithm

Expose `window.chordPilot.analyzeRange(payload)` through both bridges. The
canonical request includes the song audio reference, range, selected sources,
and effective chord-analysis options. Desktop adapters resolve file paths;
web adapters receive opaque media IDs and resolve them through existing
storage checks. The backend receives resolved local paths, never arbitrary
browser-provided filesystem locations.

The web adapter verifies each selected stem belongs to the supplied song's
registered stem set; desktop uses the current song's stem records. A request
cannot combine sources from different songs. Web analysis uses the existing
serial work queue and sanitized log broker.

Add an `analyze-range` Python CLI operation, implemented in a focused study
module. It reuses audio decoding, chroma extraction, bass evidence, candidate
ranking, and option normalization. It does not run beat detection, lyrics,
bar construction, whole-song chord analysis, or Demucs. Existing decoded audio
may be reused; first-time compressed-source decoding may still read the full
file, but spectral analysis only processes the requested interval.

For every selected source, slice samples to the validated interval before
calling feature extractors. Helpers receive the cropped array and local
times beginning at zero. Padding required for short FFT windows contains
zeros, never samples beyond the requested end. Report evidence in absolute
source seconds. Validate against real decoded source and stem durations;
reject a selected source that cannot cover the requested interval rather
than silently padding missing audio or shrinking the range.

Source rules are explicit:

1. With Bass and at least one non-bass stem selected, compute harmonic chroma
   from the non-bass stems and obtain a separate bass reference from Bass.
   Bass informs root and inversion ranking. This preserves the current
   high-quality approach for the default Bass + Other combination.
2. When Bass is the sole source, use its chroma as harmonic evidence and its
   bass reference in ranking.
3. With several non-bass stems selected, average their normalized chroma
   vectors with equal weights, ignoring silent vectors. Store per-stem note
   evidence as well as the combined vector. Do not let playback mixer volume
   change analysis weighting.
4. With Full Mix selected, use its harmonic chroma and no separately selected
   bass reference. With no Bass selected, do not inject bass-stem evidence.

Use the original detected song key as the default ranking context when
available, with an optional study-specific key override. If no song key is
available, infer a provisional key from the selection and label that context
in the result. No neighboring bar chords influence this isolated study.

The operation returns a suggested chord, chord and pitch confidence,
alternatives with scores and reasons, combined detected pitch classes,
per-source evidence, optional bass reference, range, effective settings,
and an explicit local-study algorithm version. Silence returns N.C. with
empty note evidence. Missing dependencies or decoding failure return errors;
the study operation must not fall back to a fabricated draft chord.

## Results and keyboard

Show the suggested chord prominently, then confidence, candidate alternatives,
source labels, and ranking reasons. Scores are labeled as confidence or
relative strength, not calibrated probabilities of correctness. Choosing
an alternative fills the optional Corrected Chord field without rewriting
the stored algorithm suggestion or changing a chart bar.

Reuse the piano evidence renderer with combined pitch strengths, chord-tone
outlines, and a distinct bass pitch marker. Label it Pitch classes; use note
names without claiming detected octaves. A text note list accompanies the
keyboard so color is not the only way to read the result. Shared piano-helper
changes must preserve the existing bar evidence display.

Allow a study-specific known key, chroma frequency bounds, candidate count,
and simplify-chords choice using current backend options. Seed these from
the song's effective analysis settings, except that key context uses the
original detected key. Snapshot normalized settings into every run. Tempo,
onset, lyrics, and Demucs controls do not appear in this tab.

## Saved study model and persistence

Add an optional `studies` array to the existing version-1 session payload.
Older sessions load with an empty array. Each study has:

- `id`, `name`, `created_at`, and `updated_at`;
- editable `start`, `end`, `sources`, `settings`, `notes`, and
  `corrected_chord` fields;
- a `runs` array of immutable successful analysis snapshots, each with its
  own ID and timestamp, exact range and sources, effective settings, input
  fingerprints, algorithm version, and returned evidence;
- `selected_run_id` to identify the displayed historical result.

Study sources use semantic stem names or Full Mix, resolved against the
session's audio and chart stem records. Do not embed copies of audio or
filesystem paths in result history. Input fingerprints record size, modified
time, and a digest of the selected decoded samples per source so changes can
be detected without hashing the whole song. Algorithm version is independent
of the application package version and changes when study output semantics
or scoring change.

Save Study adds a named item or updates the opened study in session memory.
An empty name defaults to Study plus the formatted range. Save Session
persists these items through the existing desktop or server save operation;
the tab states that studies persist with Save Session and marks unsaved
study edits. It does not imply a new disk autosave guarantee.

Opening a study restores its editable range, sources, settings, notes,
corrected chord, and selected run. Selecting a historical run displays its
own input labels and evidence without changing current draft inputs. A new
successful analysis appends a run; failed attempts leave existing history
intact. Offer a simple previous-run selector and comparison of chord,
confidence, settings, sources, range, and detected notes with the selected
current run. Comparisons of different inputs remain explicitly labeled.

Renaming and deleting studies update session memory. Reanalysis of the song
keeps studies associated with the same source audio; loading a different
song clears study state. Session save/open/import/export round-trips the
entire studies array. Web schema validation and location redaction continue
to apply, and saved study history remains readable if cached stems are
cleared or source audio is missing. Playback and rerunning require the
relevant audio to be available.

## UI state, errors, and integration

Keep draft selection, open study ID, displayed run, dirty state, and loop
state in renderer study state. During analysis, capture the current song
identity and request inputs. Disable duplicate Analyze actions, indicate
progress, and discard a response if the song changed. Results remain tied
to captured inputs if the draft changes while work is running.

Clear draft state and stop loops when audio is replaced. Failed analysis
retains the draft and saved results. Missing sources, invalid ranges, and
unavailable backend libraries produce actionable messages without clearing
history. Study loops must not leave Arrangement playback muted or stems
playing after navigation, errors, or session restoration.

Expected integration points are renderer HTML/CSS/state/shell, a new study
renderer module, timeline modifier handling, session payload build/restore,
shared piano evidence helpers, both renderer bridges, Electron IPC, shared
services, the web API/storage validation, and Python CLI/range analysis.
Keep existing unrelated working-tree changes intact.

## Verification and acceptance

Use targeted automated tests for interval bounds and cropping, short-range
padding, silence, stem combinations, Bass + Other roles, source association,
settings snapshots, response isolation after a song switch, and saved-history
round trips. Synthetic pitched signals before, inside, and after a selection
must show that outside notes cannot influence its result. Verify a clear
synthetic triad and bass inversion with the real spectral/ranking path;
assert evidence and expected candidate ordering rather than universal
accuracy on arbitrary music.

Exercise both adapters with real request shapes, reject invalid web media
IDs and unrelated stems, and test persistence after cache clearing. Run the
existing JS and Python suites after implementation.

Manually verify Ctrl/Command and visible-toggle selection with zoom/scroll,
timestamp editing, playback and loops, piano/text evidence, study save/open,
history comparison, original-audio behavior under chart transposition, and
navigation cleanup in both desktop and browser runtimes. Confirm ordinary
timeline clicks, Arrangement mixing, existing bar piano evidence, old
sessions, and song reanalysis still behave correctly.
