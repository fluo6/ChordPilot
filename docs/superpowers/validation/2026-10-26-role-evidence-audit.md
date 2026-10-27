# Follow-up: model evidence for unresolved roles

User requested the next task after the bounded five-song pass finished. This is
an additional, manual diagnostic step focused on Overjoyed, with cached checks
on the other four recordings. The completed queue and deleted schedule stay closed.

## Question and outcome

Could boundary contamination or a second model explain the remaining abstentions?
Neither tested shortcut resolves Overjoyed's musical abstentions at the existing
0.8 acceptance threshold. Do not lower that threshold, fill labels from a chart,
or merge the models into a new production decoder on this evidence.

The new read-only audit is `tmp/audit-structure-role-evidence.py`. It reads cached
audio-model outputs and the retained fine intervals, checks recording identity,
and integrates probability streams at their respective frame rates. It compares
each full interval with its central 80%, fixed before examining the result.
Partial frames are duration weighted. Sub-frame uncovered tails in four songs
are reported explicitly; probabilities are not extrapolated into them.

No reference annotations, sessions, lyrics or supplied section answers enter
the diagnostic. Session files are read only by the subsequent integrity check.
The diagnostic does not change inference, grouping, retained outputs or sessions.

## Overjoyed evidence

Scores below are uncalibrated model outputs, **not correctness probabilities**.
These are fine occurrence intervals, not proposed edits to the musical form.

| Interval (seconds) | SongFormer full interval | SongFormer central 80% | All-In-One full interval |
|---|---|---|---|
| 34.84–46.40 | Verse 0.727; Pre-chorus 0.163 | Verse 0.724 | Verse 0.745 |
| 69.52–81.08 | Verse 0.376; Pre-chorus 0.341 | Verse 0.407 | Verse 0.717 |
| 104.19–115.73 | Instrumental 0.400; Chorus 0.354 | Instrumental 0.457 | Chorus 0.419 |
| 138.87–150.43 | Verse 0.668; Pre-chorus 0.205 | Verse 0.712 | Verse 0.518 |
| 202.43–220.45 | Outro 0.661 | Outro 0.673 | Outro 0.597 |
| 220.45–222.47 | Silence 0.778 | Silence 0.821 | End 0.695 |

Only terminal silence crosses 0.8 after trimming. Every unresolved musical
interval remains below threshold. All-In-One provides no strong agreeing
alternative for any of these unknown intervals. Requiring both models to be
strong would trivially exclude SongFormer abstentions; the useful check here
is whether All-In-One alone is strong and agrees with SongFormer's winner.

All-In-One's ten-class vocabulary has no Pre-chorus. SongFormer's selected
eight-class vocabulary does include it as class 26; its class 8 is a separate
label in another schema and is masked out here. This is not a missing label-map
bug. A cross-model vote would be structurally biased against Pre-chorus unless
unsupported classes are treated as unavailable, rather than negative evidence.
The models are not independent human annotations; agreement cannot certify a role.

The score differences from earlier checkpoints come from explicit partial-frame
weighting, not new inference. The retained decoder still uses its original
frame slicing and is unchanged. This numerical audit does not establish the
correct role of the ambiguous phrases or validate the provisional reference.

## Cached cross-song checks

All five reports pass recording-hash, finite-probability, vocabulary-mask and
time-coverage checks. No musical abstention reaches 0.8 by the fixed core trim.
All-In-One has strong agreement with a weak SongFormer winner at one fine
interval in I Love You 3000 (173.00s), three in Waste of Time (141.47s, 150.87s,
179.11s), and none in Ballad or Liang Bo. These are leads for evaluation, not
validated new labels. They are diagnostic outputs, never inference constants.

Fine-row unknown totals can differ from coarse musical-form coverage because
the retained pipeline attaches terminal silence to the preceding occurrence.
Do not substitute these diagnostic totals for the existing coverage metric.

## Architectural consequence and next work

Retain separate boundary, content-identity, function and display fields. A model's
unsupported role must remain distinguishable from a supported role with weak
evidence. Keep strong occurrence roles intact; sharing accompaniment is not
sufficient evidence to share a role or melody identity.

The next substantive model experiment should measure richer audio representations
for recurrence, alongside an independently evaluated functional model. Capture
the already-installed SongFormer MuQ/MusicFM representations without changing
its weights, freeze boundaries, and inspect whether repeated melody is separated
from shared harmony. Do not tune representation distances or source conditioning
against the expected Overjoyed labels. Independent recording-level evaluation
is still required before promoting either grouping or functional changes.

## Sources and reproducibility

- [Author label map](https://huggingface.co/ASLP-lab/SongFormer/blob/a75880ed1b7375ac71860ec6c4fc9c899cf99515/dataset/label2id.py): local pinned source is hashed in each report.
- [SongFormer paper](https://arxiv.org/abs/2510.02797): multi-resolution representations and learned source conditioning; this does not establish superiority on these recordings.
- Local All-In-One vocabulary: `tmp/structure-neural-deps/allin1_infer/config.py`, also hashed.

Run `C:/Python39/python.exe tmp/audit-structure-role-evidence.py overjoyed i-love-you-3000 waste-of-time ballad liangbo`.
Outputs are in `outputs/song-structure/role-evidence-audit/`: per-song JSON,
full top-three evidence for every fine interval, input hashes and integrity verification.

Outcome: diagnostic completed; no algorithm promotion or original-session overwrite.
The 66.26 seconds of Overjoyed abstentions remain unresolved. No scheduled job
was created or extended.
