# Configurable chord stability

Analysis Options now offers Detailed (default), Balanced, and Sustained chord
stability. It applies only to Auto chord timing and is saved with session
analysis settings. Fixed grids and legacy one-chord-per-bar analysis retain
their existing behavior.

The optional stability pass evaluates sequences using both local candidate
scores and neighboring pitch evidence. It nominates contextual chords so a
rolled piano voicing can be recovered even when individual beats omit tones.
Clear independent bass changes constrain candidate choices and reduce the
transition cost; silence remains silence. There is no hard minimum chord
duration. Higher stability may omit brief changes with weak evidence.
Context windows are measured in time so changing the subdivision grid does
not shrink the stability window. Clear contrasting chord cores are protected
even without a bass stem, to avoid borrowing extensions across actual changes.

Original beat detections, alternatives, pitch evidence, and bass references
remain in event debug cells. Contextual chart labels use the chosen chord,
rather than replacing it with the highest-scoring local alternative.

Read-only check against cached mdx_extra stems for J.Sheon – Ballad, using the
saved 152 BPM beat grid and Am key, including a full-song timing pass:
Sustained returns Fmaj9 throughout bars
5–8 (6.432–12.748 s), while retaining the brief G9sus4 at 13.142–13.537 s in
bar 9. Balanced is less aggressive and retains the Dm11 passage in bar 6.
This is a result on these cached inputs, not an independently transcribed score.

Regression coverage includes a rolled piano Cmaj9, uncertain relative voicings,
confirmed bass changes, settings restoration, distinct cache keys, and keeping
the contextual label in chart rendering. Existing Detailed-mode chord/timing
regressions remain applicable.
