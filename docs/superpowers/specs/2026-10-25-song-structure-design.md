# Song structure recognition: staged design and delivery scope

Date: 2026-10-25. Status: approved by the user; built-in Stages 1–4 implemented. Stage 5 has an evaluator and smoke results, with the independent-annotation/default-release gate still open. Semantic Stages 6–7 remain pending. See [validation](../validation/2026-10-25-song-structure.md).

Builder check: an independent software-engineering reviewer reported "nothing important left" on the original design. The staged revision has been self-reviewed for dependencies and acceptance coverage. Neither check is implementation or recognition validation.

## Outcome

Replace ChordPilot's invented section pattern with audio-derived section boundaries and repeated groups such as A, B, A, C. Make the result navigable, editable, persistent and exportable. Separate this from semantic naming: identifying a repeated section does not establish that it is a chorus.

The user's request is to improve recognition using the linked Song Structure Recognition Research and to challenge the data structure. The chat reader returned the research request and a content-reference placeholder, not the report body. This proposal is grounded in the actual application and the primary sources below; it does not claim to reproduce the unavailable report.

## What happens today

- `backend/chordpilot_common.py` contains `SECTION_PLAN`: Intro 4, Verse 8, Chorus 8, Verse 8, Chorus 8, Bridge 8, Chorus 8, Outro 4.
- `estimate_bars_from_audio()` and `build_bars()` in `backend/chordpilot_analysis.py` call `expand_sections()`. Both real analysis modes and the failure draft inherit the pattern. The fallback also creates repeat signs at fixed indices.
- A bar has a free-text `section` but no section occurrence, interval, group, origin or evidence. Adjacent equal names are merged by `prototypeSections()`; chart headings also depend on string changes.
- The table and Bar Settings edit `bar.section` directly. Bar add/duplicate/split/merge/delete/start edits change the grid independently. Chord reanalysis replaces bars and currently loses section edits.
- Sessions serialize the whole chart, so an optional structure object can be introduced without changing the outer session version. Desktop and web share runtime services. Existing chord reference fixtures are selected passages, not full-song structure annotations.

## Approaches

| Approach | Benefit | Cost and limitation |
| --- | --- | --- |
| Built-in acoustic boundaries and A/B groups first — recommended | Works with the existing NumPy/SciPy stack, offline, in both modes; fixes fabricated output immediately | Cannot reliably supply verse/chorus semantics; musically similar neighboring sections may remain one interval |
| Pretrained All-In-One first | Predicts functional boundaries and roles, including verse and chorus | Adds PyTorch/NATTEN/madmom/model integration; official Windows instructions require a NATTEN source build; still needs validation and manual correction |
| Rules assigning roles from loudness, position or repetition | Cheap and superficially plausible | Quiet choruses, chorus-first songs, instrumental music and reused chord loops defeat the assumptions; rejected as default output |

Proposed choice: deliver the built-in route incrementally, with a working manual structure editor before adding detection. Boundaries, repeated groups, measured default release and semantic naming are separate milestones. Stages 1–5 form the built-in implementation scope; Stage 6 is a semantic feasibility experiment and Stage 7 is conditional product integration. Do not install models or start training during Stages 1–5. Existing deferred chord-ML/rootless-voicing work stays deferred.

## Data model

Introduce optional `chart.structure`; store one record per section occurrence, rather than making every bar independently define song form. Source-audio seconds are authoritative. Bar numbers are derived and can change. The schema below is the shared target: Stage 1 introduces it, Stage 3 supplies boundary evidence, Stage 4 supplies repeated groups, and Stage 7 can supply automatic roles. Keep the same schema across stages instead of adding a replacement format for each detector.

```json
{
  "version": 1,
  "analysis": {
    "engine": "builtin-novelty-v3",
    "source_fingerprint": {"size": 123456, "mtime_ns": 123456789},
    "grid_signature": "hash-of-measured-grid-and-duration",
    "status": "estimated",
    "diagnostics": [],
    "segments": [
      {"id": "s1", "start": 0.0, "end": 18.2, "group": "A", "role": null,
       "evidence": {"boundary_score": null, "repeat_score": null}},
      {"id": "s2", "start": 18.2, "end": 36.7, "group": "B", "role": null,
       "evidence": {"boundary_score": 0.64, "repeat_score": null}},
      {"id": "s3", "start": 36.7, "end": 55.0, "group": "A", "role": null,
       "evidence": {"boundary_score": 0.71, "repeat_score": 0.93}}
    ]
  },
  "manual_segments": null,
  "stale": false
}
```

The numbers above illustrate the contract, not measured accuracy. `analysis.segments` retains automatic results. On the first edit, copy the effective segment list to `manual_segments`; subsequent edits change that list. Effective sections are `manual_segments ?? analysis.segments`. This is a complete small list, not an operation log or generic annotation framework.

- `id` identifies an occurrence, not a musical role or repeated group. IDs persist during edits; reanalysis may create new detected IDs. Never reconnect edits to new predictions using matching array positions.
- `group` is nullable and identifies acoustically similar occurrences within the analysis. Letters are assigned in first-occurrence order; continue A…Z, AA… if needed. An A group can have different roles in different occurrences. Group letters are not identities across reanalyses.
- `role` is nullable. Supported manual names initially include intro, verse, pre_chorus, chorus, post_chorus, bridge, solo, instrumental, breakdown and outro. A custom `label` is optional. Display precedence is custom label, role, group, then Unlabelled.
- Occurrence numbering, displayed bar ranges and colors are derived. Do not introduce separate group tables, variant hierarchies, per-bar confidence fields or persisted bar indices.
- Boundary strength and repeat similarity are evidence scores, not probabilities. A first occurrence has no repeat score. Missing evidence stays null; manual segments have `origin: "manual"` and no inherited detector scores.
- A valid nonempty partition covers `[0, chart.duration]` exactly, with finite ordered endpoints, positive durations, unique IDs, and no overlaps or gaps. Use half-open intervals; only the final interval includes the endpoint. Store shared boundary values once when splitting to avoid rounding gaps.
- `bar.section` and `bar.section_id` become derived compatibility fields. Project them from the effective segment containing the bar's start; the initial bar can inherit the segment covering time zero when its first measured start is later. Use occurrence IDs to distinguish adjacent sections with the same name. Keep the top-level intervals authoritative.

For a decode failure, return unavailable analysis with an empty detected list and a diagnostic, not fabricated A/B or semantic sections. For silent audio, return one unlabelled interval with insufficient-evidence status. Zero-duration audio has no intervals. Low energy alone does not establish that an opening is non-musical.

## Built-in analysis

1. Analyze the original full mix in both fast and high-quality modes. Reuse the already loaded mix when possible; do not derive structure solely from the accompaniment or drum stem. No additional separation job is needed.
2. Extract normalized chroma, log spectral-band shape, RMS level and onset activity with NumPy/SciPy. Preserve temporal order within bars. Keep structure features independent of chord-name choices, transposition display, tail/overtone preferences and manual chord edits.
3. Aggregate on measured bar intervals, with a few temporal bins per bar. Include time zero, pickup and final partial audio. Record whether downbeats were model-measured, manually phased or unverified. When a valid musical grid is unavailable, use bounded fixed-time features and report that limitation instead of inventing downbeats.
4. Compute local change evidence at several window sizes around each eligible boundary. Use adaptive prominence and minimum-spacing suppression to reject weak fluctuations. Phrase lengths are soft context only: never create a boundary merely because 4, 8 or 16 bars elapsed, and never require an intro, bridge or outro. No global maximum section length forces splits.
5. Compare ordered segment feature sequences, resampled to a common small temporal representation, with separate harmonic/timbre/activity distances. A shared chord histogram alone is insufficient. Check reverse-order and same-chords/different-texture negatives. Reject unsupported matches instead of assigning a known group to everything.
6. Cluster conservatively using complete-link similarity, so a chain of marginal matches cannot merge two dissimilar sections. Assign group letters deterministically in occurrence order. Keep silence/insufficient-evidence intervals ungrouped. Initial weights/thresholds are engineering defaults to validate, not calibrated probabilities.
7. Emit source-time intervals and sparse evidence. Keep large feature/similarity matrices out of saved sessions. Bound feature bins and pairwise allocation; coarsen long inputs and report resolution. Do not allocate an unbounded frame-by-frame square matrix. Measure runtime and peak memory before shipping.

Initial boundaries prefer existing bar starts when the grid is usable. Manual section creation uses a selected bar start. Do not change the beat grid or split a chart bar automatically to make a detector result fit. An unchanged texture or repeated verse/chorus backing may hide a boundary: document this limitation rather than force a pop template.

The precise frame size, feature weights and prominence thresholds are implementation decisions, selected with synthetic cases and a development set. Log the chosen algorithm revision and parameters. Do not tune them on the held-out evaluation songs.

## Editing, migration and reanalysis

- On loading an old session without `structure`, import contiguous `bar.section` runs as manual legacy intervals. Preserve text and custom names exactly, with `origin: "legacy"`; leave group, role and evidence unknown. Old template names and real user edits cannot be reliably distinguished. Do not silently erase either or present them as new audio predictions.
- Keep the existing per-bar Section field's scope: changing it creates/splits a manual interval over that bar's time range and preserves neighboring names. Add explicit occurrence-level controls: rename this section, start section here, and join with previous. These operate on the effective list. A group change applies to the selected occurrence unless the user explicitly chooses otherwise.
- Naming a section Verse does not merge it with its neighbor or change its repeated group. Splits keep the original detected result available; joins invalidate borrowed automatic evidence. Manual role/label edits do not claim detection confidence.
- Reanalysis on the same source updates the detected list but preserves a manual list, including imported legacy labels. Show that new detected sections are available and provide an explicit Use detected sections action. A failed attempt leaves the last successful result and all manual data available.
- Chords-only and lyrics-only refreshes retain structure. Add a structure-only refresh through the existing backend/runtime/desktop/web patterns; it must not re-separate audio or replace chords, lyrics, melody, drums, notes, repeats or bar timing. Web requests resolve registered media IDs server-side, following the existing media access checks, rather than accepting arbitrary filesystem paths. Isolate structure failures from the successful chord payload so one exception cannot discard the other analysis.
- Add/duplicate/split/merge/delete bars and editing bar starts reproject compatibility fields and mark the automatic grid basis stale. Canonical source intervals stay at their original times. Do not move section times merely because bar numbers changed. If a boundary now falls inside a displayed bar, show its exact source time in section navigation and project the heading at the first following displayed bar; indicate the projection limitation.
- Key and playback-speed changes leave source-time intervals unchanged. Changing source identity invalidates old predictions; do not transfer another song's manual map automatically. A changed/relinked path requires matching audio content identity before automatic transfer; file size, modification time or duration alone cannot establish that two sources are identical. Compute a content hash for this relink check as needed; normal repeat analysis can reuse the existing stat-based cache identity.
- Preserve the existing async chart/audio identity guards. A completion from an earlier song must not update the active session. Reject malformed/unsupported structure versions without discarding unrelated chart data; retain unknown-version data for round-trip saving and fall back to compatibility labels for display.

The automatic source/grid/algorithm revision enters the structure cache key, and the main analysis cache gains a structure revision so old template results are not returned as current recognition. Store only automatic output in analysis caches; user edits remain in sessions. Retain existing decoded-audio/stem caches.

## Presentation and export

- Reuse the current section navigation and timeline strip. Render each occurrence by ID with a stable color per repeated group; show A/B when role is unknown. A tooltip/detail shows exact times, role, origin, evidence and stale status without inventing a percentage.
- Charts and PDF headings honor occurrence boundaries even when adjacent names match. Keep existing bar-level display as the compatibility projection, including custom legacy labels.
- Text and CSV export consume the effective projection; text emits headings on ID changes as well as name changes. MusicXML must preserve existing musical data and add/reuse section directions where supported. JSON/session export retains the canonical structure.
- No new workspace, generic timeline framework, playback subsystem or notation engine. Keep the Section controls inside the existing inspector/navigation.

## Staged delivery

Each stage is a separately reviewable change with a usable result and its own tests. Finish its exit checks before starting dependent work. A technical exit check means tests or measured evidence, not another routine permission request. Keep the working application usable between stages; no stage requires all later stages to be present.

| Stage | User-visible result | Depends on | Release state |
| --- | --- | --- | --- |
| 1. Honest output and durable data | New charts stop inventing song form; existing section names survive save, edits and reanalysis | Existing app | Shippable foundation |
| 2. Manual structure editor | Users can create, rename and join section occurrences consistently across the app | 1 | Shippable manual workflow |
| 3. Automatic boundaries | The app finds likely section changes and exposes editable intervals | 1–2 | Opt-in experimental detection |
| 4. Repeated A/B groups | Similar occurrences share a group without assuming verse or chorus | 3 | Opt-in experimental recognition |
| 5. Real-song evaluation and default release | Recognition becomes the default only after measured improvement | 3–4 and frozen evaluation references | Built-in release decision |
| 6. Semantic model benchmark | Evidence establishes whether a model can name verse/chorus usefully on the target platform | Shared schema and evaluation harness | Isolated experiment |
| 7. Automatic musical roles | Optional semantic analysis supplies supported musical names with manual correction and fallback | 6 passes feasibility checks | Conditional later release |

### Stage 1 — Stop fabricated output and establish the data contract

**Scope:** Introduce the interval contract, legacy import, manual overlay, projection and validation. Remove `SECTION_PLAN`, `expand_sections()` and the fixed fallback repeat signs from new analysis. With no detector yet, successful analysis produces one unlabelled interval with `status: "not_analyzed"`; failed decode uses `unavailable`. Preserve old section text as legacy manual data rather than relabeling it as recognition.

Wire the existing per-bar Section input, save/restore and bar add/duplicate/split/merge/delete/start changes through the shared structure helpers now. Preserve section edits during same-source analysis refreshes. Source changes and malformed/unknown structure versions follow the lifecycle rules above. This keeps the new authoritative model consistent from its first release.

Create a small evaluator/fixture contract and record the legacy-template and one-section baselines. Choose and record development/evaluation song splits before tuning an acoustic detector; keep reference labels outside inference.

**Files:** New `backend/chordpilot_structure.py`, new `src/renderer/song-structure.js`, new `tests/python/test_structure.py` and `tests/js/song-structure.test.js`; update `chordpilot_analysis.py`, `chordpilot_common.py`, `tests/python/test_analysis.py`, `actions.js`, `bars.js`, `shell.js` and the script list in `index.html`. Introduce `scripts/testing/structure-benchmark.py` and `tests/fixtures/structure-references/` for evaluation-only data.

**Exit checks:** New charts and missing-file drafts contain no invented Intro/Verse/Chorus or repeat signs. Old custom labels round-trip unchanged. Existing per-bar edits and every bar mutation preserve a valid partition and source-time ownership. Chord/lyric refreshes cannot erase manual sections. Unsupported structure data survives save without crashing unrelated chart display. Schema/evaluator fixtures and affected existing tests pass.

**Usable checkpoint:** Honest unlabelled drafts and durable section data; no automatic structure-quality claim.

### Stage 2 — Make manual sections a complete workflow

**Scope:** Add explicit occurrence controls in the existing inspector: rename this section, start section here and join with previous. Keep the per-bar field's existing scope. Display origin and exact source time. Retain original automatic data separately even though this stage normally has none yet.

Make section navigation, timeline colors and every chart/export heading consume occurrence identity. Adjacent occurrences named Verse remain distinct. Source-time navigation and bar-based notation use the projection policy above when a boundary falls inside a displayed bar.

**Files:** `song-structure.js`, `bars.js`, `prototype-workspace.js`, `chart-workspace.js`, inspector markup/styles, `alphatab-score.js`, `alphatab-renderer.js`, numbered/spreadsheet renderers and `chordpilot_export.py`; extend the matching JS/Python tests.

**Exit checks:** A user can build and revise A–B–A manually, save/reopen it, navigate each occurrence and export matching headings. Renaming one occurrence does not rename another or change its group. Same-name adjacent occurrences remain separate in timeline, chart and PDF/text output. Custom labels and partial-bar projection remain readable and seek to the correct source time.

**Usable checkpoint:** A complete manual song-structure editor, independent of detector quality.

### Stage 3 — Detect boundaries without guessing repeated groups

**Scope:** Add full-mix acoustic features, measured-grid aggregation, multiscale novelty and candidate suppression. Output editable source-time intervals with `group: null` and `role: null`; show numbered unlabelled sections for navigation. This isolates boundary accuracy from grouping accuracy.

Add structure-only analysis through the CLI, shared runtime, Electron and web. Use registered media access checks and existing asynchronous chart/audio guards. Integrate with normal analysis behind an explicit opt-in structure-analysis option, initially off; persist that option using the existing analysis settings. No automatic stem preparation or additional model environment. Recompute automatic sections without overwriting the manual overlay; expose Use detected sections. Add source/grid/algorithm cache identity and invalidate old template-era main analysis results.

**Files:** `chordpilot_structure.py`, `chordpilot_analysis.py`, `chordpilot_common.py`, `chordpilot_cli.py`, `src/runtime/chordpilot-services.js`, Electron main/preload, web server/bridge, `actions.js` and existing analysis setup/state wiring. Add acoustic/integration tests to the structure suites and service/bridge suites.

**Exit checks:** Synthetic changes are detected through the actual extractor; a uniform loop does not acquire periodic fake boundaries. Pickups, final partial intervals, silence, invalid grids and long inputs follow the specified degradation rules. Both modes analyze the full mix. Structure-only refresh leaves chords, lyrics, notes, repeats, stems, melody, drums and bar timing intact. Failure retains prior usable output; stale jobs cannot update another song. Desktop/web access and cache checks pass.

**Usable checkpoint:** Opt-in automatic segmentation with manual correction, without claiming repeated groups or musical names.

### Stage 4 — Recognize repeated A/B groups

**Scope:** Compare ordered segment features and add conservative complete-link grouping. Assign A, B, C in first-occurrence order with stable colors and separate occurrence IDs. Reuse the Stage 3 segmentation and refresh path; introduce no new data format or endpoint. Keep roles unknown and leave insufficient-evidence intervals ungrouped. Revision the structure cache when grouping changes.

**Files:** `chordpilot_structure.py`, `song-structure.js`, structure tests and evaluator; only touch display code where group labels/colors need wiring.

**Exit checks:** A–B–A matches the two A occurrences. Reverse-order harmony, same-chord/different-texture and marginal-match chains do not collapse into one group. First occurrences have no invented repeat score; silence remains ungrouped. Reanalysis preserves manual edits. Displayed similarity is evidence, not an accuracy percentage. Report grouping and boundaries separately on the development songs.

**Usable checkpoint:** Opt-in, editable A/B recognition using the existing chart grid.

### Stage 5 — Validate complete songs and decide the built-in default

**Scope:** Complete independent full-song annotations and run the frozen held-out evaluation. Report boundary and repeated-group metrics, per-song failures, over/under-segmentation, runtime and memory. Include loop-based music, dynamic/quiet passages, pickup/irregular timing and non-musical openings. Benchmark structure from existing audio/grid data rather than repeatedly running chord inference or separation.

Use development songs to select thresholds; do not tune on held-out songs. Apply the release gates below before enabling automatic structure by default. If quality or annotation coverage is insufficient, keep detection opt-in and explicitly experimental. Missing reference coverage is an open validation item, not a reason to fabricate a success result.

**Files:** Structure evaluator/reference fixtures, recognition options/defaults only if justified, `README.md`, a new stable TODO item, and `docs/superpowers/validation/2026-10-25-song-structure.md` recording commands, versions, settings and results.

**Exit checks:** The reproducible report meets the boundary and grouping release criteria below, documents losses and limitations, and includes measured resource use. Relevant visual checks, `npm test` and `npm run test:web` pass. Otherwise record which gate remains open and retain the experimental setting.

**Usable checkpoint:** An evidence-backed built-in release, or a clearly documented experimental detector with the manual workflow still fully usable.

### Stage 6 — Benchmark semantic naming in isolation

**Scope:** Run the All-In-One feasibility comparison described below in a separate optional environment. Evaluate supported role names, semantic errors, boundaries, platform setup, dependency/weight terms, runtime and peak memory. Keep the app's normal Python environment and original sessions intact. Do not equate successful installation or plausible-looking labels with a useful semantic detector.

This experiment can start after Stages 1–2 and the evaluator exist if naming becomes the priority; it need not wait for the built-in default release. It does not remove the boundary/grouping work or bypass its validation.

**Files:** A separate `scripts/testing/structure-semantic-benchmark.py` experiment and dated research/validation notes; no production model dependency, API or schema fork.

**Exit checks:** A reproducible target-platform run, measured semantic and boundary comparison on independently annotated songs, installation/resource requirements, unsupported-role list and distribution constraints. Record a go/no-go recommendation with its evidence. Failure or unusable quality closes the experiment without breaking the built-in app.

**Usable checkpoint:** A concrete decision about automatic naming; no semantic recognition claim in the product yet.

### Stage 7 — Integrate automatic musical roles if the benchmark supports it

**Scope:** Add an optional semantic engine using the same interval/manual-overlay contract and structure-only refresh action. Map only supported roles, retain the model's original compact segment labels/times and revision, and preserve manual corrections. The model's beats do not replace the user's grid. Reuse the ordered-feature comparison to supply group labels for the model's chosen intervals when supported; roles and acoustic groups remain independent.

Provide model availability/progress/error handling and built-in fallback. A missing or failed model must leave the last successful result and manual data accessible. Pre-chorus/post-chorus remain unknown when the model lacks those classes. Any default change needs the same song-separated measurement and a separate semantic-quality report.

**Files:** Optional adapter in the backend structure path, model-specific setup only where needed, existing shared runtime/desktop/web refresh plumbing, analysis setup, UI status/role display and integration tests. Retain schema version 1 unless a demonstrated contract change actually requires migration.

**Exit checks:** Same-source reanalysis, missing-model and failed-model recovery, stale completion, role mapping, manual preservation and save/reopen tests pass on desktop and web. Semantic results improve on a recorded baseline on held-out annotated songs; unsupported roles and ambiguous examples are published. Platform/dependency/weight requirements from Stage 6 are satisfied.

**Usable checkpoint:** Optional automatic intro/verse/chorus naming with honest abstention and correction.

### Stage boundaries and non-goals

Stages 1–5 are sequential for the built-in release; Stage 6 is a separate experiment and Stage 7 depends on its results. Do not treat completion of the schema, detector tests or model setup as completion of recognition validation. Keep each stage in a separate change/commit and record its completed checks before advancing.

Custom training, lyric-based role inference, genre grammars, hierarchical sections and A1/A2 variation classification remain outside this roadmap. Revisit them only when measured failures show that the shipped stages need them. Reuse current service patterns; do not refactor general session storage or other recognition algorithms. Existing unrelated workspace changes must remain intact.

## Validation and release criteria

Tests must establish behavior, not merely mirror the feature math:

1. Synthetic audio/feature sequences: A-B-A repeat, changed texture with identical chords, reversed harmonic order, a long uniform loop with no forced eight-bar changes, gradual dynamics, silence, noise, pickup, incomplete ending and irregular bar lengths. Actual audio reaches the extractor in representative cases.
2. Invariants: finite exact partition coverage; boundary ownership; deterministic grouping; no grouping of no-evidence audio; no inherited scores after manual changes; bounded long-input processing. Invalid grids degrade explicitly; no guessed confidence or semantic role appears.
3. Integration: fast and high-quality structure use the full mix; structure failure does not discard successful chord analysis; cache revisions reject old template output; missing-file drafts contain no fake repeat signs or semantics.
4. Lifecycle: legacy custom labels, same-name adjacent occurrences, save/reopen, per-bar and occurrence edits, all bar mutation paths, transposition/speed changes, reanalysis preservation, unsupported schema versions, stale async completion and structure-only failure.
5. Visual checks: section strip/navigation, table, alphaTab, numbered/spreadsheet views and PDF; seek to the correct source time; equal-name occurrences retain separate boundaries; long/custom labels remain readable. Check desktop and web service parity.
6. Real recordings: annotate complete available songs with independent boundaries and repeated groups, including a loop-based song, quiet/dynamic arrangement, irregular-meter/pickup example and non-musical opening. Selected chord windows and the 30-second smoke fixture do not establish whole-song structure quality. Reference labels are evaluator-only; never feed them to detection or saved automatic results.
7. Report boundary precision/recall/F1 at 0.5 s and 3 s, excluding artificial start/end points; repeated-group agreement with a label-permutation-invariant pairwise metric; over/under-segmentation, runtime, memory and failures per song. Report semantics separately only once a semantic detector exists. Fixed-template output is a legacy comparison; one-section output is the abstaining baseline.
8. Use song-separated development/evaluation sets. Before default release, require the new output to beat the fixed-template boundary F1 at 3 s on the annotated evaluation set and beat the one-group baseline on repeated-group F1. Publish coverage and per-song losses; small local results are not a universal accuracy claim. If references are insufficient, label the feature experimental and leave this release gate open.

Run focused Python/JS tests during implementation, then `npm test` and `npm run test:web`. Record actual results in `docs/superpowers/validation/2026-10-25-song-structure.md`; no recognition gain is claimed until measured. Benchmark from structure-only analysis or existing grid/audio so unrelated chord/stem inference is not repeatedly run.

## Semantic experiment and integration details — Stages 6–7

Benchmark an isolated All-In-One adapter against the built-in boundary detector before product integration. Reuse existing separated stems only if the model's documented interface supports it; do not assume their format matches. Measure Windows CPU/GPU setup, runtime/memory and semantic errors on independently labeled songs. Review code, dependency and weight terms for the intended distribution.

The adapter maps source-time predictions into the same contract, preserves its original labels and model revision, and leaves unsupported roles such as pre-chorus unknown when the model does not expose them. A model's own beats do not silently replace ChordPilot's edited beat grid. Failed/missing model inference keeps built-in estimates and manual edits available. No custom training, genre grammar, lyric model, hierarchy or A1/A2 variant taxonomy is needed before the basic detector and evaluation work.

## Primary sources checked

- [Librosa: Laplacian segmentation](https://librosa.org/doc/main/auto_tutorials/03-advanced/plot_segmentation.html): beat-synchronous acoustic features and recurrence grouping; cluster IDs have no semantic role. The proposed simpler detector is not presented as an implementation of this full method.
- [Marmoret, Cohen and Bimbot: Barwise Music Structure Analysis](https://arxiv.org/abs/2311.18604): bar-synchronous self-similarity and global segmentation provide a useful later comparator; no claim that this proposal reproduces CBM results.
- [Wang, Hung and Smith: structural functions](https://arxiv.org/abs/2205.14700): distinguishes abstract grouping from learned musical-role classification.
- [All-In-One official repository](https://github.com/mir-aidj/all-in-one): functional boundary/role outputs and platform installation requirements. Its [repository license](https://raw.githubusercontent.com/mir-aidj/all-in-one/master/LICENSE) does not by itself establish the terms of all dependencies and weights.

## Current scope and implementation boundary

The user accepted the staged roadmap and authorized implementation. Built-in Stages 1–4 are implemented in the working tree. Stage 5's evaluator, synthetic checks and real-song smoke runs are available; independent full-song annotations and default-release evidence remain open, so recognition stays opt-in. Automatic musical naming has separate experiment and conditional integration stages. Ordinary test/review checkpoints do not require repeated user permission; a change of scope or a failed model feasibility gate must be resolved on its evidence.
