# Calibration run 1 — I Love You 3000

Completed on 26 October 2026 after retrying an approval-review account-limit
interruption. Queue advanced once, from 0 to 1. Recognition remains unresolved;
no algorithm candidate was promoted and no original session was overwritten.

## Findings and experiment

Recording hash: `9b13d7ee53f8ac1a39de921802233e96640300d2bc4e724f11dacf310e5fa7e5`.
The retained v3 output has 14 occurrences and 55.95% named-role coverage. This is
coverage, not accuracy. Its harmonic group C contains both strong model Verse
and Chorus decisions. The occurrence-preserving decoder already prevents those
roles from erasing each other; the grouping still lacks reliable melodic evidence.

Fine phrases at 109.02–119.67 and 119.67–130.33 seconds have the same native
pre-chorus label, but only the first clears the 0.8 acceptance gate. The merge
stage requires accepted roles, so uncertainty leaves phrase divisions visible.
Other uncertain late phrases are similarly fragmented. This diagnosis does not
establish which of their boundaries are musically correct.

Tested one general ablation: merge contiguous equal native function labels,
then recompute each merged role from its cached frame probabilities using the
unchanged 0.8 threshold. No chart, title rule, lyrics, supplied answers or reference
timestamps enter candidate generation. All five cached recordings were exercised
as operational regressions; only I Love You 3000 was the calibration target.

The target shrank from 14 to 7 intervals while coverage fell to 40.69%. Overjoyed
shrunk from 12 to 7 intervals, losing five of eleven expected boundaries on its
frozen provisional reference: boundary F1 at 0.5 seconds fell from 1 to 0.7059.
Rejected. Reducing the number of sections does not demonstrate better form.
Candidate generation precedes separate reference evaluation in
`tmp/calibrate-phrase-merge.py`. Results are in
`outputs/song-structure/calibration-run-1/phrase-merge-report.json`.

Research context only: [Hooktheory's contributor analysis](https://www.hooktheory.com/theorytab/view/stephanie-poetri/i-love-you-3000)
distinguishes verse and chorus and reports different melodic ranges. This is
not a complete timestamp annotation of our recording. The
[structural-functions paper](https://arxiv.org/abs/2205.14700) also distinguishes
abstract recurrence labels from functional roles. Neither source entered inference.
No independent full recording reference was established, so no accuracy claim is made.

## Naming integration

The real app now offers Named roles, A/B/C groups, and Mixed roles, groups and
custom names in Bar Settings → Song structure. The selected `structure.display_mode`
is saved with the session and preserved across same-source full and structure-only
refreshes. It affects bar headings, navigation, inspector display and backend export
projection; detected intervals and evidence remain unchanged.

Default automatic display uses roles when any are known, otherwise groups.
Unknown roles stay Unclassified. Existing legacy/manual custom text remains visible
until the user chooses a convention; switching modes never deletes those names.
This compatibility decision preserves previous user-authored data while enforcing
one convention on automatic results. No alphabet cap or fabricated groups were added.

New tests failed before implementation and passed afterward. A read-only reviewer
found that malformed/future manual lists could crash the new mode selection. Its
regression failed before the fix; mode selection now uses validated active rows.
No other actionable review findings remain.

## Verification and retained limitations

- Full suite after the review fix: 465 JavaScript passed, 1 optional skipped;
  283 Python passed. Log: `outputs/song-structure/calibration-run-1/final-tests.log`.
- All five cached v3 outputs reproduced with reference/session reads blocked
  during inference. Partitions and source hashes pass; Overjoyed metrics unchanged.
- Live app exercised against an isolated workspace-only session: roles show Verse,
  groups show C, mixed shows Verse. Saving and reopening retains groups. Saved raw
  segments and fine evidence equal the algorithm artifact; manual_segments is null.
- Initial UI fixture had the older rounded duration and was correctly rejected.
  Corrected only the preview fixture to the exact decoded duration; originals intact.
- SHA-256 checks confirm all five originals still match their last recorded imports.
  Evidence: `outputs/song-structure/calibration-run-1/final-verification.json`.
- Screenshot: `outputs/song-structure/calibration-run-1/app-naming.jpg`.
- Listening comparison refreshed with an explicitly rejected merge variant for the
  target. Default remains v3. Product Detect still uses the existing builtin detector.

The failed automatic approval review was an account usage-limit failure, not a
safety rejection. A second scheduled trigger arrived while that interrupted run
was unfinished; it did not process another song. After the user's retry, the same
automation was updated to four remaining runs at 138-minute intervals, retaining
the original total scope of five songs. Next is Waste of Time; do not repeat this
rejected merge rule or treat this target as solved.
