# Beat tracking

The default **Onset tracking** follows spectral-flux attacks. High-quality
analysis uses the drum stem when available, otherwise the full mix.
First Downbeat selects a manual bar phase. A faint drum stem can contain bleed
and give unreliable timing on percussion-free recordings.

**Beat This! (optional)** uses the full mix and predicts beats and downbeats
together. It uses the official `final0` checkpoint on CPU. Chord and bass analysis
still use the selected accompaniment and existing bass stems. The engine choice
is saved with analysis options. Beat Offset remains available; the onset/BPM and
manual-phase controls are disabled because this model supplies those positions.

Install `beat-this` and its compatible PyTorch/torchaudio dependencies in the
Python environment used by ChordPilot. Put the official `final0.ckpt` at
`.tool-cache/beat-this-models/final0.ckpt`, or set
`CHORDPILOT_BEAT_THIS_CHECKPOINT` to its absolute path. The backend also recognizes
the project's optional evaluation package folders. Models and packages are not
bundled into app builds and are not downloaded automatically during analysis.
The tested checkpoint SHA-256 is
`8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331`.

See the [official installation, models and MIT license](https://github.com/CPJKU/beat_this).

The current chart assumes 4/4. Between consecutive model downbeats the decoder
retains one nearby model beat per quarter-note slot (within 22% of the local beat
period); missing quarter peaks are interpolated and counted in analysis metadata.
Extra strum peaks cannot add beats or shift later bars. Earlier supported beats
form a pickup. Unsupported beats are not extrapolated through the final fade.
Grossly irregular bar lengths produce an error requesting meter review.

Predictions remain unverified estimates, especially on pickups, meter changes,
rubato and percussion-free music. Manual verification and an independent
beat/downbeat reference remain necessary for accuracy claims. This is an optional
engine, not a change to recognition defaults for existing sessions.

## Steady pulse (experimental)

**Beat This! — steady pulse** is an explicit alternative for recordings where
the minimal peak decoder switches between half/double time. It uses the same
audio-only model's frame probabilities with librosa's dynamic beat path (tightness
300). The existing BPM Min/Max controls bound the autocorrelation pulse prior;
for example, a 60–90 range excludes a competing ~132 BPM interpretation without
specifying any individual beat time. The reported BPM comes from measured
eight-beat spans, not an entered rounded clock.

The model decoder keeps the autocorrelation pulse rather than applying the
onset tracker's preference for tempos above 80 BPM. Slow songs can therefore
remain in their own pulse without forcing an octave jump. Half/double-time
ambiguity can still require a per-song BPM range; no song inherits Forever
Love's range in the algorithm.

A sequence decoder prefers 4/4 and permits penalized 2/4 bridges when later
downbeat support favours a phase change. Its two-beat placements are estimates:
strong downbeat predictions on both halves of a bar can make the exact change
position ambiguous. They are listed in **Beat / bar alignment needs review**.
An incomplete ending is a partial final measure, not evidence for an extra 2/4
transition. Leading supported beats before the first full downbeat are labelled
as a pickup and retain the full written meter in alphaTab. Beat offsets retain
the corresponding edge measure counts; an unsupported shifted tail is marked
inferred rather than stretching a measured quarter note.
Weak opening/fade pulses are retained as inferred timing so source notes remain
covered. Partial final measures carry their actual beat count. The per-measure
meter is shared by chords, bass, drums, melody and numbered notation.

This decoder does not use sheet music, PDF content, lyrics, song titles or
reference timestamps. It requires the existing optional Beat This! installation
plus librosa. The default onset tracker and original strict 4/4 model decoder
remain unchanged. Missing dependencies or insufficient evidence produce errors;
the selected engine is never silently replaced.

The `bounded-steady-v2` revision has a separate analysis cache suffix; the
default onset/strict-model caches and existing saved sessions remain usable.
See [cross-song validation](superpowers/validation/2026-10-21-cross-song-beat-alignment.md).
