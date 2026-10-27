# Overjoyed structure tuning checkpoints

## Checkpoint 1: root cause investigation

Recording: `Overjoyed [678STgx-Esw].mp3`, SHA-256 `fa4413b7a82f785027b6f87c83c2d340aa11e3480f813c8377a3680fe0c12ed6`, duration 222.46666666666667 s. Frozen raw baseline: `outputs/song-structure/model-comparison/overjoyed.mdx.raw.json`. The `.mdx` filename and blanket separation note are historical mistakes for this song: the session engine is `demucs htdemucs internal`, stem paths name HTDemucs, and all four WAV headers are stereo 44,100 Hz, 9,810,780 frames. No sample-rate or stem-order mismatch was found. Do not rerun separation merely to reproduce an assumed MDX discrepancy.

The model's saved label probabilities favor Intro over 0–10 s (means .777 and .878 in the two 5-second windows), then Verse over 10–15 s (.834). The saved boundary activation has an early peak at .17 s (.423) and a weaker transition at 10.97 s (.030). The upstream functional decoder peak-picks with a symmetric 12-second window. The .17-second peak suppresses 10.97 s. Its 0.17–34.84 interval is labeled by mean probability, which favors Verse and erases the intro. This is a decoding failure even before considering semantic errors elsewhere.

The same fixed window can suppress section changes shorter than 12 s. Functional probability errors also exist: e.g. parts of the second verse favor Chorus. Changing peak picking alone cannot be assumed to solve these.

Research sources (evaluation context only):

- [Tony Conniff's original harmonic analysis](https://tonyconniff.com/stevie-wonders-overjoyed-under-the-hood/) distinguishes a four-bar introduction, eight-bar verse, four-bar pre-chorus and eight-bar chorus, and discusses the final modulation.
- [Hooktheory contributor analysis](https://www.hooktheory.com/theorytab/view/stevie-wonder/overjoyed) independently distinguishes Intro, Verse, Pre-Chorus and Chorus; this is a section example, not a complete timestamped performance annotation.
- [Poparad lead sheet](https://www.poparad.com/pdf/overjoyed-c.pdf) supplies Intro/Verse/Chorus and repeated/extended ending notation. Do not copy the score or assume an arranged lead sheet independently establishes recording-specific timestamps.
- [All-In-One paper](https://arxiv.org/abs/2307.16425) describes joint metrical and functional prediction. The installed model taxonomy has no pre-chorus class.

No complete independently verified source-time annotation has been found. A bar-aligned reference derived from these sources must remain provisional until checked against this recording. The previous 65-second chord benchmark is a different audio source and its timestamps must not be copied.

Next: freeze an explicitly provisional reference, add semantic scoring, test one peak-window change. No product detector or original saved session was changed in checkpoint 1.

## Checkpoint 2: frozen provisional benchmark

`tests/fixtures/structure-references/overjoyed.development.json`, SHA-256 `826280799c88ea4f96b196484798b2f48c4ef73dfc242abaf1842b8a3194d9a8`, records 12 provisional occurrences. It distinguishes the opening, three verses, three pre-choruses, three chorus occurrences, the intro-material instrumental return and the outro. Mapping uses the saved musical downbeats, not the previous chord benchmark's different audio. The final chorus extension, outro and recurrence grouping remain expressly uncertain. This reference is frozen before any decoder change and remains evaluation-only.

The evaluator now reports duration-weighted role agreement, coverage, accuracy on covered regions and a confusion table. Unknown/A/B/C roles cannot inflate full-duration accuracy; matching boundaries cannot hide wrong labels. Different content hashes are rejected. The three new regressions failed before implementation and all seven evaluator tests passed after it.

Frozen baseline versus this provisional reference: boundary F1 .2857 at .5 s (3 of 11 reference boundaries, 10 predicted boundaries), .5714 at 3 s; role duration agreement .6747. Raw semantic output has no content groups, so its group score is not evidence of detected recurrence. Report: `outputs/song-structure/overjoyed-benchmark/baseline.metrics.json`.

No original session changed. Next: one beat-scaled peak-spacing experiment using the identical saved activations, recording duration and content hash only.

## Checkpoint 3: peak-spacing hypothesis tested and rejected as a complete fix

`scripts/testing/structure-decoder-experiment.py` reimplements only the existing probability-to-segment decoding for controlled comparison. At 12 s its output reproduces all 11 baseline labels and times exactly, after the documented final recording-end clip. A four-model-beat window (4 × .72 = 2.88 s) recovers the model's Intro interval .17–10.97 s and finds all 11 provisional boundaries within 3 s, but creates 30 segments. At .5 s, boundary F1 falls .2857 → .2500, while role duration agreement rises .6747 → .7369. It also invents a short Chorus inside the second verse. **Rejected as an import/product fix.**

Three synthetic decoder checks pass: early intro with a stronger start peak, exact source-duration clipping, invalid activation rejection. One initial test assertion incorrectly rejected even the tiny forced first interval; it was corrected to test the missing eight-second transition. PowerShell's unquoted numeric argument formatting also rounded the supplied duration; explicit quoting preserves exact partition identity. Neither issue changed the frozen reference or model data.

Next hypothesis: use audio-content recurrence to distinguish repeated musical material, independently of functional labels. Investigate the [McFee/Ellis Laplacian method and author's implementation](https://librosa.org/doc/latest/auto_tutorials/03-advanced/plot_segmentation.html). No original saved session or production detector changed.

## Checkpoint 4: content-only alternative rejected; investigate a suitable semantic model

`tmp/probe-content-structure.py` ran the McFee/Ellis CQT/MFCC recurrence-graph method on the full mix with model-derived beat peaks. It reads no reference/chart. It tries 2–8 clusters and chooses maximum silhouette without reference access. Its selected two-cluster result has six sections, no detected intro and boundary F1 0 at .5 s. Five clusters happen to recover the opening at 11.7 s but other boundaries are wrong; selecting that count from the reference would contaminate the experiment. All variants and diagnostics remain in `outputs/song-structure/overjoyed-benchmark/content/overjoyed/`. No candidate was imported.

Ruling: further arbitrary peak-window or cluster-count changes cannot solve the missing pre-chorus taxonomy or establish semantic correctness. Investigate [SongFormer](https://github.com/ASLP-lab/SongFormer/) and its [paper](https://arxiv.org/abs/2510.02797) as a separate model candidate. The author's implementation explicitly emits pre-chorus. Preserve that class when scoring, even though its published seven-class benchmark merges pre-chorus into verse. Author-reported aggregate accuracy is not Overjoyed validation. First inspect code/dependencies/checkpoint footprint; use an isolated local experiment if feasible.

Progress checkpoint: benchmark/scorer complete; two hypotheses tested and rejected for promotion; all 18 affected Python tests pass. Product detector and original sessions remain at the previous turn's results.

## Checkpoint 5: limited intro fix, suitable-model preparation

A narrower candidate excludes peaks within one detected beat of recording edges from internal peak competition. Forced recording endpoints remain; class selection is unchanged. On Overjoyed it recovers Intro 0–10.97 s while retaining 11 intervals. This projects to Intro on bars 1–4 without reading bar starts or reference labels. At .5 s F1 remains .2857 (the vocal-pickup boundary is .77 s before the provisional musical downbeat); at 3 s F1 improves .5714 → .6667. Role agreement improves .6747 → .7240. The remaining semantics are still wrong. This is a partial candidate, not a complete fix or a 100% result.

Its new regression checks both early-boundary recovery and a chorus-first signal retaining Chorus. The same rule produces valid raw intervals on the other four recordings, but no reference accuracy claim is made for them. Outputs: `outputs/song-structure/overjoyed-benchmark/edge-guard.json` and `edge-guard-regression/`. Original sessions still unchanged.

SongFormer preparation is isolated under `tmp/songformer-*`. Author model revision: `a75880ed1b7375ac71860ec6c4fc9c899cf99515`; full checkpoint 2,755,035,132 bytes. Small source/config files were inspected before execution. MuQ 0.1.0 official source SHA-256: `67ebb47d238e702151253d08e83e2dbbbe89d24c414b5b410d9b3db55c4a6fa8`. Only inference dependencies are installed in the workspace; no global packages or app dependency files changed. The minimal adapter omits unused training/evaluation imports and MuLan text-model imports, and caches MusicFM's original architecture config locally. It changes no model arithmetic or predictions. Source hashes/adaptations are recorded in `tmp/songformer-adapted/adaptation.json`.

The large checkpoint download is resumable and validated by exact byte ranges and the author's LFS hash after completion. The current import probe found a missing `regex` dependency; installation is pending at this checkpoint. No song audio leaves the computer.

## Checkpoint 6: verified comparison and local model construction

The listening comparison is available locally at `http://127.0.0.1:3318/overjoyed-benchmark/review/`. It separates the frozen baseline, partial edge candidate, two rejected candidates and evaluation-only provisional annotation. Browser verification confirmed 11 edge-candidate rows, 11 baseline rows, 12 reference rows, successful audio playback/transition seek, readyState 4 and no media error. Playback was paused after verification. This is not a recognition-quality approval.

`npm test` completed: 461 JavaScript tests passed, one optional test skipped, zero failures; 277 Python tests passed. A subsequent native pre-chorus spelling regression failed before normalization and then passed with the 20 affected structure tests. Pre-chorus is retained as a distinct role and never mapped to Verse for this benchmark. No further product code changed.

SongFormer imports and constructs offline successfully (688,449,153 parameters). An additional adapter postpones Python 3.10 union type annotations on the existing Python 3.9 interpreter; it does not change model computation. All five original session hashes still equal the previous turn's verified imports. Checkpoint transfer reached 82%; inference has not run at this checkpoint. Next: hash verification, unchanged native inference, score with pre-chorus retained, then evaluate any justified decoder change separately.

## Checkpoint 7: learned content consensus, with explicit semantic abstention

The checkpoint completed and matched author LFS SHA-256 `8dcabf4ea19973edd51b9e5794004775fa7e8de3ecfa07eb1dbce00f516ce7f7`. Loading reported no missing/unexpected/mismatched keys or errors. Native fp32 inference on Overjoyed took 75.2 s and peak PyTorch CUDA allocation was 8.59 GiB, including model weights in this measurement. Native output has 9 intervals and recovers Intro; role duration agreement .7772, boundary F1 .3158 at .5 s. Its native endpoint exceeds recording duration by .02223 s, within one 8.333 Hz output frame; the score-only canonical copy clips only that endpoint. Full raw output remains unchanged. Runtime warnings came from dividing unused padded frames before truncation; saved logits/results used in scoring are finite except deliberately masked unused class logits (-infinity).

The six-second-window candidate, using exactly those cached logits, recovers the instrumental and all provisional boundaries within 3 s, but has 19 fine/phrase intervals. Its role agreement is .8259 and .5 s boundary F1 .4138. Neither the native nor this fine list is a complete solution.

`tmp/probe-structure-consensus.py` then implements the next multi-stage candidate, using no reference/chart input:

1. Refine native fine boundaries to independently predicted All-In-One audio downbeat peaks within 1.5 audio-predicted beat periods. No saved bar grid is read or changed. Reject collapsed/inverted intervals.
2. Compare ordered CQT-chroma sequences with a single global semitone transposition, duration penalty and an MFCC texture veto. Complete-link clusters avoid chaining. Counterexamples reject identical harmony with orthogonal textures and reverse-order progressions.
3. Average the semantic label distribution across acoustically recurring vocal material, retaining an automatic role only above the fixed .8 model-score gate. These scores are not calibrated correctness probabilities. Non-vocal occurrences retain independent semantic evidence, so Intro material can return without being named Intro again.
4. Merge adjacent phrases with the same accepted role while preserving recurrent content that marks new occurrences. Uncertain recurring transitions retain a letter rather than a guessed Verse/Chorus name.
5. In the musical-form partition, attach native terminal Silence to the previous occurrence; preserve exact native/fine intervals separately. Here the final two seconds are a continuous audible fade, not an abrupt new musical section. This is an explicit general presentation policy, not a supplied timestamp.
6. Compare the merged, ordered sequences with complete-link DTW, transposition and texture checks, allowing an extended/key-shifted chorus to share a content family.

On the frozen **provisional development** reference, the resulting 12 occurrences match all 11 boundaries at .5 s (F1 1.0) and achieve duration-weighted content-group F1 .999126. Known-role coverage .702173; accuracy on covered time .999616; full-duration role accuracy .701903, because uncertain regions count as abstentions, not successes. This does **not** establish 100% semantic or independently verified song accuracy. Timing differences from the provisional reference remain on the order of hundredths of a second. The three transitional passages are C, the instrumental return is A (same content as Intro), and the ending is E with unknown role. No research role names were copied into inference.

Outputs and all intermediate candidates are retained under `outputs/song-structure/songformer-experiment/`. Two further recordings (Waste of Time and I Love You 3000) are running through the same model/rules for operational comparison; they have no independent quality annotations.

The project Python runner passed 278 tests after pre-chorus spelling support. A direct system-Python run failed `test_installed_librosa_keeps_opening_attack_and_excludes_silent_tail` because the base Python 3.9 has incompatible SciPy/NumPy/numba versions; this is not the project test environment or the isolated model environment. No unrelated rhythm code was changed.

## Checkpoint 8: reviewed experimental import and inspection artifact

An independent read-only reviewer confirmed the metrics, current source/reference identities, reference separation, and valid finite partitions on all three experimental recordings. The reviewer approved a controlled **Overjoyed-only experimental import**, explicitly declining to certify musical ground truth, cross-song quality or production readiness. Its cache finding was resolved: SongFormer now freshly decodes each source and checks its hash before/after inference; CQT caches contain recording hashes and verify beat-cache provenance. Fresh independent FFmpeg decodes of all three current recordings match the exact WAVs used for inference.

The cross-song exercise caught a real genericization bug before import: one logits filename still named Overjoyed. A finite-score check failed on Waste of Time, then passed after slug-specific loading, recording-length validation and non-finite probability/JSON rejection were added. All three complete partitions and input identities now pass. Overjoyed output was unaffected. Waste has 16 experimental occurrences and .458 role coverage; I Love You 3000 has 14 and .203 coverage. These are operational checks, not evidence that other songs are correct. Their originals were not overwritten.

`tmp/import-overjoyed-consensus.py` prepared the result inside the workspace, then its import path checked the explicit original target, original/prepared session hashes, source content hash, complete partition, native/fine preservation and equality of all unrelated session data. The reviewer separately checked preparation and the guarded import path. After import, a fresh read verified the original file's hash equals the prepared copy, the raw native list is unchanged, no manual overlay exists, and all non-structure content is equal to the before snapshot. All four other original session hashes are unchanged.

Saved original: `C:\Users\Fujia\Documents\ChordPilot-Data\Overjoyed [678STgx-Esw].chordpilot-session.json`.

Derived bar headings: Intro 1–4; Verse 5–12; C 13–16; Verse 17–24; C 25–28; Chorus 29–36; A 37–40; Verse 41–48; C 49–52; Chorus 53–62; Chorus 63–70; E 71–77. These ranges were projected **after inference** from its source-time intervals; they did not enter recognition. A is recurring intro material, B the verse content, C the repeated uncertain transition, D chorus content (including its extended/key-shifted occurrence), E the ending. Unknown semantic roles remain unknown.

The actual renderer helper accepted the saved schema without altering structure, produced all 12 occurrence headings, and retained adjacent Chorus occurrences separately. Browser inspection verified the 12-row candidate, group column, separate seven candidate/reference choices and playable source media. The comparison remains at `http://127.0.0.1:3318/overjoyed-benchmark/review/`; screenshot `outputs/song-structure/overjoyed-benchmark/review/review.jpg`. Import hashes/before snapshot are in `outputs/song-structure/overjoyed-benchmark/session-update/`. The final inference audit actively blocked reads of references and saved sessions and still reproduced the result; its code hash is recorded in `overjoyed.inference-audit.json`.

**Current limit:** 11/11 boundaries within .5 s on a provisional development annotation, group F1 .999126, named-role coverage .702173, accuracy on covered time .999616. This is not 100% independently verified correctness. Further work remains on semantic coverage, other-song quality and product integration. This updates the saved benchmark only; the application's Detect sections operation still uses the previous built-in detector.
# Follow-up checkpoint: occurrence roles and recurrence are different evidence

User explicitly authorized upgrading the struggling algorithm. Inspection of
cached audio logits found a concrete decoder bug: I Love You 3000 at 23.69–45.03
seconds has a direct Verse score 0.984, while 66.33–87.71 has Chorus 0.989. Similar
harmonic descriptors put both in one group, and v2's averaging withheld both roles.
This is a consensus failure; another pretrained model is not required to fix it.

The v3 experiment preserves each direct role at the unchanged 0.8 threshold.
Only weak occurrences whose eligible content peers all have the same winning role
can borrow pooled evidence. Intro/instrumental/outro evidence remains local.
Fine occurrence decisions, support indices and score basis survive merging.
Harmony/texture grouping is still limited: equal group letters do not establish
equal melody or role. No reference, fixed form or song-specific timestamp enters
inference. Model outputs remain uncalibrated.

Four synthetic tests failed before the helper existed, then passed. Together
with decoder and evaluator tests, 16 tests passed. A fresh independent reviewer
also ran 870 randomized cases and checked fine/merged evidence and partition
invariants on the first three recordings; no blocker. Overjoyed's v3 boundaries,
groups, roles and every evaluation metric equal v2 exactly. Waste of Time's layout
is unchanged. I Love You 3000 coverage rises from 20.32% to 55.95%; this is not a
measurement of correctness. Overjoyed's original session need not be rewritten
because its displayed result is unchanged. The product detector is not upgraded
by this headless experiment.

Final verification: all five recordings completed and produced valid full-duration
partitions. `tmp/verify-structure-v3.py` reran inference with reads of reference
annotations and session JSONs actively forbidden; all source hashes match the
actual audio. The evaluation ran separately afterward and confirmed identical
Overjoyed v2/v3 metrics. Its original session hash is unchanged.

| Recording | v3 occurrences | Named-role coverage |
| --- | ---: | ---: |
| Overjoyed | 12 | 70.22% |
| I Love You 3000 | 14 | 55.95% |
| Waste of Time | 16 | 45.83% |
| Ballad | 17 | 67.34% |
| Liang Bo | 28 | 62.53% |

These are operational and coverage results, not cross-song recognition accuracy.
Ballad and Liang Bo still show fragmentation and shared-harmony grouping across
different functions. Do not promote the experiment to the product default.
The original Overjoyed session already contains the same section layout; no
original was overwritten in this follow-up. Other originals retain the earlier
native All-In-One results. All five experimental v3 results are on the existing
listening comparison page, alongside prior v2 where available and raw SongFormer.

`npm test` outside sandbox passed: 461 JavaScript tests, one optional skip,
282 Python tests. The initial sandbox run failed on temporary-file rename and
symlink EPERM restrictions; the successful rerun and both logs are retained under
`outputs/song-structure/songformer-experiment/`. `git diff --check` passed, with
only pre-existing line-ending warnings. No product detector, model weights,
threshold, or manually supplied section label changed.

Research check: [SongFormer author's repository](https://github.com/ASLP-lab/SongFormer/)
and [label map](https://huggingface.co/ASLP-lab/SongFormer/blob/main/dataset/label2id.py)
confirm dataset-dependent vocabularies and explicit pre-chorus support. Retain
the eight-class head; do not map pre-chorus into verse merely to simplify scores.
Replacing the model again would not fix the diagnosed consensus bug. Melody-aware
recurrence and independently annotated evaluation remain the next meaningful
upgrade targets. All previous checkpoints below record v2 development and import.
