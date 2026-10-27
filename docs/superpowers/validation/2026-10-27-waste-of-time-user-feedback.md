# Waste of Time: user listening feedback

Evaluation only. This is user-supplied feedback, not independent ground truth and not an inference input. No model output or session was edited.

Expected sequence supplied by the user:

Intro → Verse → Pre-chorus → Chorus → Chorus → Verse → Instrumental → Pre-chorus → Chorus → Chorus → Verse → Outro → Unclassified

The retained SongFormer native output has 13 occurrences. Aligning the supplied sequence by occurrence order yields the following differences. Times come from the native output; the user has not supplied or confirmed exact boundaries.

| Occurrence | Native interval (seconds) | Native label | User expectation |
| --- | --- | --- | --- |
| 8 | 141.36565462618503–160.20640825633026 | verse | pre-chorus |
| 11 | 199.56798271930876–222.48889955598224 | chorus | verse |
| 13 | 249.36997479899196–252.25009000360015 | silence | unclassified |

Other labels agree under the display alias inst → Instrumental. This is sequence agreement, not a boundary-accuracy score. Silence and unclassified carry different meanings: the former is a model class, the latter means no accepted musical function.

Native evidence: outputs/song-structure/overjoyed-benchmark/review/waste-of-time.raw.json. The review manifest preserves separate adjacent choruses at 58.44–77.88 and 77.88–98.28 seconds. The v3 experiment instead merges the first chorus pair into 59.09–99.11, yields 16 coarse occurrences overall, and abstains on the first pre-chorus (winning probability 0.69067, below the 0.8 role threshold).

Relevant processing: tmp/probe-structure-consensus.py uses a different six-second boundary decode, beat snapping, same-role merging conditioned on recurrence anchors, and terminal silence attachment. scripts/testing/structure-role-consensus.py gates role acceptance at 0.8. Therefore native versus v3 differences are not solely a grouping/display issue.

Next hypothesis to evaluate: retain native occurrence boundaries as the baseline for role analysis, and compare occurrence 8 with the first pre-chorus and occurrence 11 with earlier verses using audio evidence. Do not replace labels because of this sequence, merge adjacent occurrences merely because they share a function, or lower a threshold to obtain the supplied answers. Validate any proposed general rule across songs and retain unresolved roles explicitly.
