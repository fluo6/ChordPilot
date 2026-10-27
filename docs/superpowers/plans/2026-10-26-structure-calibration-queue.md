# Scheduled song-structure calibration

Final pass status: all five songs reviewed. Run 5 (Overjoyed) reproduced the
retained 12-section layout and all cached regressions; 66.26 seconds remain
unclassified. No inference candidate was promoted and original sessions stayed
unchanged. On final verification, queue index is 5 and the automation is deleted.
See `docs/superpowers/validation/2026-10-26-calibration-run-5.md` for evidence and
remaining work. Earlier progress notes below are historical, not a new schedule.

User request: calibrate one existing song at a time, 2.3 hours apart. Use a bounded
first pass of five runs, every 138 minutes. Work slowly; save a compact checkpoint
after each run and preserve algorithm-only results.

Created and verified active heartbeat `calibrate-song-structure-one-song-at-a-time`
on this chat, with a five-song limit. Run 1 is recorded as reviewed but unresolved;
`next_index` is now 1 (Waste of Time). After an account-limit interruption and user
retry, the same automation was updated to four remaining runs at 138-minute
intervals. No extra songs or indefinite tuning were added.

Run 2 is now reviewed but unresolved; `next_index` is 2 (Ballad). The author
12-second boundary window reduced Waste's section count without improving role
coverage and regressed Overjoyed, so it was not promoted. See
`docs/superpowers/validation/2026-10-26-calibration-run-2.md`. Three songs remain
on the existing schedule; it was not reset or extended.

Order: I Love You 3000, Waste of Time, Ballad, Liang Bo (曾经是情侣), Overjoyed.
Run 3 (Ballad) was started early by explicit user request. Its weak self-repeat
candidate reduces 17 sections to 12 with unchanged pointwise roles and unchanged
Overjoyed metrics, but remains unpromoted pending musical evaluation. See
`docs/superpowers/validation/2026-10-26-calibration-run-3.md`. On verified completion,
`next_index` is 3; two songs remain. Do not reset the schedule. Delete the automation
at index 5, including any unused heartbeat left by this early manual run.
Overjoyed is last as a regression check because its grouping is currently the
best understood. The first four remain unverified, not accuracy benchmarks.

Run 4 (Liang Bo) audits the frozen weak-self-repeat candidate: 28 to 25 sections,
unchanged roles, 14 unknown intervals and unresolved harmonic grouping. No new
inference change or original-session import is promoted. On verified completion
`next_index` is 4; only Overjoyed remains. See
`docs/superpowers/validation/2026-10-26-calibration-run-4.md`.

State lives in `outputs/song-structure/calibration-queue.json`; advance one entry
per run after recording outcome, even if that song remains unresolved. Do not
repeat the same unsuccessful parameter changes or silently mark it correct.
After five runs, report remaining issues and leave the bounded schedule finished.

User presentation preference: one convention per song. Offer A/B/C groups or
functional names; mixed names/letters only by explicit opt-in. Unknown functions
stay Unclassified in functional mode. A large I/J/K/L/M alphabet is evidence to
investigate over-segmentation and feature quality; never cap letters, fabricate
repeats, or merge by position merely for appearance. The comparison page now
gets this presentation selector; carry the preference into the actual application
with appropriate persistence and tests during the scheduled work.

Comparison-page implementation is complete: Named roles is the default (unknowns
say Unclassified), A/B/C shows only group names, and Mixed is explicit opt-in.
Choices are remembered per song while the page stays open. All three modes were
browser-verified; prediction JSONs and occurrence boundaries are unchanged.
Overjoyed's group sequence remains A B C B C D A B C D D E.

Application integration is also complete and verified in run 1: `display_mode`
persists in the saved structure, same-source refreshes retain it, and backend
exports respect it. Automatic defaults choose roles if available, otherwise groups.
Legacy/manual custom names retain their earlier display until an explicit choice.
Read `docs/superpowers/validation/2026-10-26-calibration-run-1.md` before the next run.

The old Python static server did not support reliable audio seeking. Replaced the
local review server with the project's existing Express static middleware via
`node tmp/serve-structure-review.cjs` (127.0.0.1:3318 only). Browser verification
confirmed a jump to Liang Bo's 2:52.46 chorus instead of restarting at zero.
Current server exec session: 88272 (restarted during run 2). Start outside the restricted network sandbox
if the browser cannot reach it; do not expose it on public interfaces.

For each song: inspect audio-derived predictions; find suitable primary musical
references where useful; build independently justified, recording-specific
evaluation annotations separate from inference. Identify one concrete error,
change general-purpose inference/model/decoder if evidence supports it, and rerun
the selected song plus cached cross-song regressions. Record boundaries, content
grouping, semantic accuracy and unknown coverage separately. Never read reference
answers, user edits, lyric section tags or title-based rules as inference inputs.

Existing baseline: SongFormer + independent All-In-One downbeats + CQT/MFCC
recurrence + v3 occurrence-preserving role consensus. Read
`docs/superpowers/validation/2026-10-26-overjoyed-structure.md` and
`docs/superpowers/plans/2026-10-26-overjoyed-structure.md` first. New v3 artifacts
are in `outputs/song-structure/songformer-experiment`; scripts under `tmp/` are
headless experiments and are not integrated with the app's Detect button.

The user previously authorized overwriting original sessions at
`C:/Users/Fujia/Documents/ChordPilot-Data`, but only import genuine algorithm
outputs when evidence supports the result. Preserve unrelated audio, beat, chord
and transcription data, retain raw model outputs/provenance, validate the full
partition and saved result, and respect filesystem permissions. Leave current
originals intact when a candidate has no demonstrated improvement. No manual
corrections, invented 100% claims, deployment, pushes or unrelated changes.
