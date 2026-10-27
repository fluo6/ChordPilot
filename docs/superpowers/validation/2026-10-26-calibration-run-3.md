# Calibration run 3 — Ballad

Started early at the user's request. Exactly one target reviewed: J.Sheon,
Ballad. Other recordings were cached regression checks. Outcome: promising
segmentation candidate, musical accuracy unresolved. No original-session writes
or production detector changes. Queue advances from index 2 to 3 (Liang Bo).

## Root cause and bounded experiment

The retained v3 output has 17 sections and 9 content groups. An anchor is created
whenever a content group starts an accepted role. Every subsequent occurrence of
that group/role then preserves a boundary, even an adjacent self-repeat. Ballad
therefore retains two adjacent Intros and pairs of Verses and Choruses. Their
native boundary sigmoid scores are only 0.0091, 0.0055, 0.0356, 0.0082 and 0.0344;
major role transitions have scores around 0.89–0.95. The short-window peak picker
can select weak local peaks, and the anchor rule did not consult their strength.

Single hypothesis: relax an existing anchor when adjacent fine segments share
both an accepted role and a content group, and the native boundary score is below
0.5. The threshold is an experimental neutral sigmoid cutoff, not calibrated
probability or a tuned sweep. Boundary evidence is sampled at the native model
time (maximum within one frame), before independent downbeat snapping.

`scripts/testing/structure-occurrence-merge.py` preserves the existing accepted-role
merge elsewhere. Strong self-repeat anchors, returns after contrasting content,
role changes and unknown roles retain their prior treatment. Full fine predictions
and role evidence remain available. No unknown labels are promoted. This differs
from run 1's rejected same-native-role merge and run 2's rejected global window.

The driver `tmp/calibrate-weak-self-repeat.py` runs one common rule on all five
caches, blocks reference/session reads during inference, and snapshots its code.
Song identifiers select cached audio only; there is no title-dependent inference.
The original v3 pipeline/artifacts remain unchanged.

| Recording | Sections before → candidate | Groups before → candidate | Named duration |
|---|---:|---:|---:|
| Ballad | 17 → 12 | 9 → 7 | 67.34%, unchanged |
| I Love You 3000 | 14 → 14 | 9 → 9 | 55.95%, unchanged |
| Waste of Time | 16 → 16 | 13 → 13 | 45.83%, unchanged |
| Liang Bo | 28 → 25 | 11 → 11 | 62.53%, unchanged |
| Overjoyed | 12 → 12 | 5 → 5 | 70.22%, unchanged |

All pointwise roles and fine predictions match v3, ignoring added boundary
evidence. All partitions, evidence spans and audio identities validate. Overjoyed's
provisional reference metrics are identical: boundary F1 at 0.5 seconds 1.0,
group F1 0.9991262, full-duration role agreement 0.7019029. This does not certify
the unannotated songs or establish 100% accuracy.

## Remaining musical uncertainties and disposition

Ballad's native pre-chorus spans 51.35–76.96 and 128.16–153.76 remain unclassified
and internally split. Their role scores are below the acceptance threshold.
The 179.29–199.57 instrumental-like ending is also uncertain. Harmony-based
groups still cannot certify melodic sameness or Verse/Chorus function.

The candidate's single intro ends at 25.76; accepted verses span 25.76–51.35 and
102.55–128.16; accepted choruses span 76.96–102.55 and 153.76–179.29. These are
algorithm outputs for listening, not independently annotated answers.

[Sony Music's release announcement](https://sonymusic.com.tw/news/20191108-j-sheon/)
describes the guitar/string arrangement, but supplies no recording-specific
timestamp map. It supports investigating arrangement changes, not treating
harmonic similarity as section identity. No web text or lyric tags enter inference.
No independent listening certification was performed in this run.

Retain this candidate for comparison; do not promote it or overwrite an original
session yet. In particular, Liang Bo's three removed boundaries have not been
musically evaluated. Its scheduled run can investigate those changes as part of
that song's calibration. Unknown roles need better model evidence; more merging
alone will not solve them. No extra parameter sweep or new schedule was added.

## Verification and handoff

- Seven synthetic tests failed before the helper existed, then passed. They cover
  weak self-repeats, strong boundaries, content returns, role conflicts, unknowns,
  threshold equality, input immutability/evidence retention and invalid scores.
- All 32 structure Python tests pass. All five retained v3 caches reproduce with
  reference/session reads blocked. `git diff --check` passes (line-ending warnings).
- Listening comparison includes `Candidate · boundary-supported phrase merge` for
  Ballad. Default remains retained v3. Names default to functional roles with
  unknowns explicit; group naming remains optional. Saved-bar hints are display only.
- Final verification checks original hashes against import manifests, exact
  candidate-to-page rows, screenshot existence, test logs and unchanged Overjoyed
  metrics before advancing the queue exactly once.
- Artifacts: `outputs/song-structure/calibration-run-3/`, including five candidates,
  `weak-self-repeat-report.json`, code snapshot, test/regression logs, comparison
  screenshot and final verification. No app Detect integration in this run.
- Two songs remain, Liang Bo then Overjoyed. Leave the existing interval unchanged;
  delete the automation when index reaches 5 so the early manual run does not add
  an extra song or redundant post-completion run.
