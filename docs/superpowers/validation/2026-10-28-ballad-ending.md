# Ballad ending investigation

The evidence favors one top-level Outro covering native occurrences 15 and 16, approximately 2:59–3:39. This supersedes the provisional naming recommendation in the Interlude audit. This is an evaluation finding, not an applied label correction or a claim of independently verified accuracy.

## Evidence

- SongFormer occurrence 15 spans 179.287–192.008 seconds. Its average class scores are Instrumental 0.54863 and Outro 0.31774.
- Occurrence 16 spans 192.008–218.889 seconds. Its scores are Outro 0.70500 and Instrumental 0.24376. These scores are uncalibrated.
- The cached All-In-One `harmonix-all` result assigns one Outro from 178.17 to 218.90 seconds. Its source hash matches SongFormer's recording. It used MDX-extra stems rather than its training-time HTDemucs preprocessing, so this is supporting evidence from a feasibility probe, not independent ground truth. The matching result in model-comparison is a duplicate, not another independent vote.
- Native contextual refinement passes both occurrences through unchanged. It only considers uncertain verse, chorus, pre-chorus and bridge labels, and retains all boundaries. Instrumental/outro ambiguity is outside its scope. Lowering its confidence threshold would not address this limitation.
- Acoustic recurrence is not uniformly decisive: occurrence 15 is closest to occurrence 16 in only one of eight views; other views favor earlier choruses. Reusing chorus material does not rule out an outro function, and differing texture does not itself require a new top-level function.

The [Open University endings lesson](https://www.open.edu/openlearn/history-the-arts/listening-form-popular-music/content-section-12) describes coda/outro as concluding material. Instrumental texture and outro function can coexist. A functional summary should therefore be able to represent one Outro with internal instrumental passages and retained lower-level boundaries.

## Implementation implication

The general missing capability is terminal-region functional analysis, separate from vocal recurrence correction and instrumentation. A future candidate should weigh terminal context, model alternatives and audio continuity, preserve the native intervals underneath, and avoid automatically swallowing every instrumental passage before an outro. A separate closing solo can remain a meaningful subdivision.

No algorithm, review result, or original session was changed. No independent listening or lead-vocal/chord transcription verification was performed. The precise outro onset (the models differ by 1.12 seconds) and the musical significance of the 3:12 boundary remain unresolved.

Evidence is recorded in `outputs/song-structure/ballad-ending-audit/evidence.json`. The report was reopened and verified; input checksums were unchanged. No product tests were needed for this read-only investigation.
