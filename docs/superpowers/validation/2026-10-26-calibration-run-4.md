# Calibration run 4 — Liang Bo (曾经是情侣)

Outcome: reviewed, unresolved. The frozen run-3 weak-self-repeat candidate has
useful internal evidence but remains unpromoted. No new thresholds, model changes,
manual corrections or original-session overwrites. Advance index 3 to 4 after
verification; only Overjoyed's regression pass remains.

## What the algorithm is doing

Retained v3 has 28 occurrences, 11 content groups, 62.5268% named-role duration
and 14 unknown intervals totalling 151.08 seconds. Coverage is not accuracy.
The frozen candidate has 25 occurrences, still 11 groups and identical role
coverage. All pointwise roles and fine predictions remain unchanged.

Three weak boundaries separate adjacent fine segments with the same content
group and accepted function:

| Removed cut | Role | Native boundary score | Combined candidate span |
|---|---|---:|---|
| 129.79 s | Verse | 0.0123615 | 115.56–143.98 s |
| 215.12 s | Chorus | 0.0309630 | 200.87–229.34 s |
| 350.23 s | Chorus | 0.0021154 | 343.11–357.34 s |

These support investigating phrase oversplitting. They do not independently prove
the combined spans are correct musical sections. Native probabilities are
uncalibrated, and an omitted boundary can still be musically meaningful.

The larger limitation is functional uncertainty and harmonic aliasing:

- Retained coarse group F includes accepted Verse, Chorus and Instrumental
  occurrences. It cannot safely be interpreted as a melodic or functional family.
- The 87.13–115.56 s passage alternates native Verse/Chorus labels with winner
  scores only 0.382–0.522. The 143.98–172.46 s passage splits between native
  Chorus and Pre-chorus with scores 0.532 and 0.416. These are uncertain model
  decisions, not a missing display label.
- The native instrumental span 229.34–286.22 s has only 257.77–272.01 s accepted
  as Instrumental. Other intervals have Instrumental/Bridge ambiguity.
- Native Chorus intervals late in the recording repeatedly cross the 0.8
  acceptance threshold. Scores 0.781, 0.770, 0.757 and 0.544 remain unknown;
  accepting them solely to make one long Chorus would manufacture confidence.
- The accepted Chorus at 172.46–186.67 s comes from compatible recurrence
  support (0.851 pooled versus 0.696 occurrence evidence). Its provenance remains
  explicit; it is not a strong independent occurrence prediction.

No forced alphabet, standard song form, blanket role transfer or further
threshold sweep was attempted. The representation still needs a distinction
between harmonic similarity, phrase boundaries and full musical section identity.
Fine observations retained alongside coarse candidates are useful for that work;
a melody/vocal-aware representation or independent annotated evaluation would
be more informative than further cosmetic merging. This is remaining work,
not a new feature implemented in this pass.

## External evidence is evaluation-only

[Kugou's song page](https://www.kugou.com/song-36/weul0eb.html) identifies
the live recording and lists a duration of 403.043 seconds. Our file lasts
403.1667 seconds. Its first sung lyric timestamp is 58.74 s, close to the model's
58.71 s Intro-to-Verse transition. This is a consistency check only: matching
duration and one landmark do not establish recording identity, exact section
boundaries or semantic accuracy. Lyric onsets can occur after section starts.

[JOOX](https://www.joox.com/my-zh_cn/single/4utxGcHAp%2BkU50qzgWFkiw%3D%3D)
also identifies the live release and its credits. Neither source supplies an
independently verified musical-form annotation. No lyric text is copied into
artifacts; no source timestamps or section answers are inference inputs. No
listening-based musical certification is claimed.

## Verification and handoff

`tmp/audit-liangbo-structure.py` reruns the frozen run-3 experiment with only the
artifact destination changed. All five generated candidates exactly match the
prior results; prior-run JSON artifacts are hash-verified unchanged. Reference
and session reads remain blocked during inference. Reference evaluation occurs
only after candidate generation. Pointwise roles, partitions, evidence spans and
source hashes validate across all five songs. Overjoyed's provisional metrics
remain identical; this is regression evidence, not cross-song accuracy.

The listening comparison adds Liang Bo's candidate with three merges and explicit
unknown/grouping limitations. Retained v3 remains the default. The naming selector
still offers roles or letters, with mixed labels opt-in. Bar hints are display-only.

Final verification requires all 32 structure Python tests, five retained-cache
regressions, candidate reproduction, exact preview rows, screenshot and unchanged
original-session hashes before advancing the queue. Artifacts are under
`outputs/song-structure/calibration-run-4/`, including `liangbo-diagnostics.json`,
candidate/regression reports, logs, screenshot and final verification.

Only Overjoyed remains. Do not extend or reset the schedule. Delete the automation
when the fifth pass completes, including the unused trigger caused by the early
manual Ballad run. App Detect still uses the existing builtin algorithm.
