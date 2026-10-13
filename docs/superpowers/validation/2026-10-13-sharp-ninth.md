# Eb7 sharp-nine detection

Read-only verification of the cached Other/Bass stems for Waste Of Time,
56.26–57.26 seconds, with key Ab and chroma limits 65–1800 Hz. The saved
session and audio were not modified.

Before the change, the parser reduced Eb7#9 to Eb7 and the audio candidate
whitelist omitted the existing PyChord 7#9 formula. The crop has strong G
(20.40%), F# (17.32%), and Db/C# (19.50%) chroma energy, with an Eb bass
reference. This supports simultaneous major-third and sharp-ninth tones.

After adding the PyChord formula, Eb7#9 ranks first at raw score 3.3613,
covering approximately 70% of pitch-class energy. Eb7 ranks second at 2.5676,
covering 53%. Ranking values are not calibrated probabilities. The unchanged
Local Study crop/analysis path also returns Eb7#9 under local-study-v4.

Sharp-nine aliases, keyboard outlines, MusicXML altered-degree encoding,
and display-only Simplify handling are covered. Unsupported alterations
are rejected instead of silently becoming ordinary sevenths. The sharp
ninth remains visible when Simplify is enabled.

Verification: 92 Python tests passed, including seventh/sharp-ninth comparisons
in all twelve keys; 234 JavaScript tests passed with the two previously
documented baseline exclusions. The installed SciPy emitted its existing
NumPy compatibility warning. No song-specific rules were added.

## Local Study applicability

An additional end-to-end regression constructs one changing-harmony recording
and a corresponding bass stem, then analyzes 36 different positions covering
all twelve roots with plain sevenths, sharp-ninth sevenths, and major ninths.
Each position is analyzed with Simplify both on and off: all 72 selections
retain the expected detailed chord name through `analyze_range`, including
ordinary sevenths where no altered note is present. Every selection uses the
same shared scorer; no product-code change was needed to apply the strategy
globally. Existing saved runs remain historical snapshots and require
reanalyzing to obtain results from the current algorithm.
