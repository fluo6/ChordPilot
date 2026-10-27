# Song structure implementation and validation

Date: 2026-10-25. Algorithm: `builtin-novelty-v3`. Schema: `chart.structure.version = 1`.

## Delivered scope

Built-in Stages 1–4 of the [accepted design](../specs/2026-10-25-song-structure-design.md) are implemented. Stage 5 has an evaluator and smoke results; the default-release gate is **not met** because independently annotated complete-song references are absent. Detection is experimental and **off by default**. No semantic model was installed; automatic verse/chorus naming in Stages 6–7 remains pending.

New analysis no longer fabricates Intro/Verse/Chorus blocks or fixed repeat signs. Source-time occurrences, repeated groups and musical roles are independent. Automatic intervals remain separate from manual/legacy intervals. Existing per-bar edits retain their time-range scope, while occurrence controls support naming, roles, groups, splitting, joining and returning to detected output.

Structure-only refresh uses the original full mix and leaves the current chords, lyrics, notes, repeat signs, stems, melody, drums and beat/bar times in place. Registered-media routing, stdin grid transport, source-content/opaque identity checks, async guards, cache revisioning and failure retention apply across the shared desktop/web services. Occurrence IDs propagate through navigation, chart rows and text/MusicXML headings.

## Verification

- `npm test`: **461 JavaScript tests passed, 1 skipped; 269 Python tests passed**. The skipped case is the existing opt-in real-session Song/Bar test, enabled by `CHORDPILOT_QA_SESSION`.
- `npm run test:web`: **125 passed**, no failures or skips.
- Enabled the opt-in real-session check with `CHORDPILOT_QA_SESSION` pointing to the existing Overjoyed saved session: **16/16 Song Details tests passed**, including unchanged-file/musical-data preservation.
- `git diff --check`: passed.
- Focused tests observed failure before the new interval/acoustic/evaluator behaviors and reviewer fixes were implemented; the final focused suites passed.

The initial sandboxed baseline could not rename temporary files or connect to loopback HTTP endpoints. The complete suites were rerun outside those restrictions. Those environmental errors are not left as product failures.

Generated audio checks cover A–B–A, a quiet harmonic change over a common bed, stationary noise, uniform tone, silence, invalid grids, temporal-order/texture negatives and uneven feature density. A source-time interpolation fix prevents dense pickup sampling from changing repeated-group identity. Novelty uses median/MAD prominence with a small evidence floor; the prior 0.14 floor missed the independently constructed quiet-change fixture. These engineering checks do not establish real-song accuracy.

Lifecycle/export checks cover exact partition validation, half-open boundary ownership, legacy/custom text, same-name occurrences, manual evidence separation, whole-bar naming across an interior boundary, sorting/reprojection, source replacement/move identity, unavailable analysis, unsupported schemas, stale jobs, same-source refresh and effective text/MusicXML output.

## Live app checks

In an isolated local web data root, uploaded generated 24-second A–B–A audio, enabled the experimental option and ran the ordinary analysis path. The existing onset engine supplied an unverified 16-bar grid. Structure boundaries were approximately **0, 7.976, 16.033, 24 seconds**, with groups **A, B, A**. This is generated material with known transitions, not a commercial-song benchmark.

Saved the test session, reloaded the page and reopened it: intervals/groups remained. Named only the first occurrence Verse, assigned manual role verse and retained repeated group A: the timeline became Verse–B–A. A structure-only refresh retained the manual name and kept the new automatic estimate separately available. The browser reported no console errors. The inspector was checked at a narrow viewport and its section controls were adjusted to span the available grid width.

![Section controls after a structure-only refresh preserves the manual Verse name](../../../outputs/song-structure/inspector.jpg)

The saved original song sessions were not overwritten. Full PDF appearance was not independently inspected in this pass; occurrence-aware chart/notation paths and exported section directions were covered by the automated suites.

## Real recording smoke runs

Used the existing full mixes and bar grids from `outputs/Overjoyed - Drum Sheet.chordpilot-session.json` and `outputs/Waste Of Time - Drum Sheet.chordpilot-session.json`. References were not supplied or used in inference. Reports are local artifacts, separate from those sessions.

| Recording | Duration | Estimated sections / groups | Elapsed, one run | Peak traced allocations |
| --- | --- | --- | --- | --- |
| Overjoyed | 222.467 s | 6 / 3 | 2.966 s | 77,233,106 bytes |
| Waste of Time | 252.253 s | 7 / 4 | 3.229 s | 83,785,169 bytes |

These counts are model output, **not verified song form**. Timings include the instrumented structure-only process and are not benchmark medians. Traced allocations are not total process RSS or GPU memory. Both supplied grids had unverified downbeats; detector provenance records that limitation.

Reproduce with the matching local full mix and existing session:

```powershell
python scripts/testing/structure-benchmark.py --audio <full-mix> --grid <saved-session.json> --output tmp/structure-smoke.json
```

Local reports: `tmp/structure-overjoyed-smoke.json` and `tmp/structure-waste-of-time-smoke.json`. Add `--reference <independent-reference.json>` only after annotating the matching recording. The evaluator reads references after prediction, ignores saved manual overlays, matches internal boundaries one-to-one at 0.5/3 seconds and computes duration-weighted pairwise group agreement independent of group letters. It includes one-group and, when the bar grid is available, historical fixed-template comparisons. The historical template exists only in the evaluator.

## Review findings and corrections

An independent code reviewer identified six Important findings; all were reproduced and corrected with regressions:

1. Retain the last successful automatic result when full reanalysis cannot estimate structure.
2. Compare known hashes regardless of source paths, preserve hashes through detector failure, and bind legacy web data to its opaque source ID.
3. Apply a per-bar label to every contained occurrence, preserving intervals outside that bar.
4. Route both table and inspector Start edits through sorting, source-time reprojection and stale marking.
5. Retain unsupported schema data without interpreting unknown metadata; validate optional v1 display fields.
6. Preserve same-name occurrence boundaries in the compact chart navigation and ChordPro headings.

The live run also reproduced a Windows path-length failure after successful inference. Analysis cache filenames now hash the algorithm/settings portion, keeping long revision strings out of filesystem components. The round-trip cache regression and the same CLI/app path passed after the correction. Existing decoded-audio and stem caches remain on their previous paths; old analysis entries may miss once.

## Remaining gates and limits

- Annotate complete recordings independently, freeze development/evaluation splits, then measure boundary/group quality and per-song losses. Existing selected chord references cannot substitute for this.
- Keep threshold selection and source-time similarity evaluation separate from held-out songs. Published smoke counts provide no accuracy claim.
- Unknown/uncertain timing and unchanged backing texture can hide structural boundaries. No intro, bridge, chorus or fixed phrase length is forced.
- Grouping is conservative and does not yet align embellished/tempo-varied repeats or classify A1/A2 variants. Silence has no repeated group. Evidence scores are not correctness probabilities.
- Measure total process resources and perform further complete PDF/desktop visual checks before a default-release decision.
- Benchmark a supported semantic model separately before introducing automatic role names; unsupported pre-/post-chorus classes must remain unknown.

Changes remain in the existing feature checkout for review; no merge, push or unrelated-file commit was performed.
