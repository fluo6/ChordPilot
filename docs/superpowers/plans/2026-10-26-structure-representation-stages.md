# ChordPilot richer audio representations: three bounded stages

User approved these stages on 2026-10-26, with the first now and subsequent
stage starts at least 150 minutes apart. This is a new experiment; the previous
five-song queue remains completed. Automation: `chordpilot-richer-audio-stages`.

## Constraints and handoff

Use `outputs/song-structure/representation-stages/queue.json` as the execution
ledger. Read its latest checkpoint first. Write a compact checkpoint after each
stage; host context compaction cannot be forced with the available tools.
Run only one stage per turn. Never overlap model jobs. Delete the automation
after stage 3 or a terminal blocker, without extending the schedule.

Stage-1 recovery: inspect `representation-stages/capture.log` and the worker
session recorded in the queue. Do not relaunch an active extraction. If the log
ends with `ALL CAPTURES VERIFIED` but the queue still says stage 1 is running,
run `C:/Python39/python.exe tmp/finish-representation-stage1.py` to independently
verify artifacts and publish the checkpoint before proceeding to stage 2.
An exception is a failure to investigate, never a completed capture.

Keep weights, source recordings and retained fine boundaries frozen. Capture
audio-only features with no reference annotations, session data, supplied answers,
lyrics or title-conditioned logic. Titles identify files only. Recurrence is
separate from function; preserve strong occurrence roles, and one display
convention per song with mixing opt-in. No alphabet cap or fixed song form.
Independent evaluation is required for promotion. Coverage is not accuracy.

## Stage 1 — capture and validate (now)

- Add a tested capture format for the existing four 25 Hz, layer-10 streams:
  short MusicFM, short MuQ, long MusicFM, long MuQ. Preserve native float32.
- Run the pinned offline author model serially on Overjoyed, I Love You 3000,
  Waste of Time, Ballad and Liang Bo. Capture input to the structural head,
  without changing tensors passed to it or the model weights.
- Save separate experiment artifacts, hashes, frame coverage and source-code
  provenance. Check reloaded arrays and compare head logits with cached inference.
- Verify retained predictions and original sessions remain unchanged. Record
  limitations: these are general musical representations, not proven melody
  encodings; temporal frame bins are nominal model timing.
- Completion: five validated caches or a documented terminal failure; no grouping
  change, product change or original overwrite in this stage.

## Stage 2 — frozen-boundary recurrence evaluation (next wake)

- Use captured streams and frozen fine occurrences, beginning with Overjoyed.
- Specify a single comparison procedure before examining desired labels. Compare
  ordered occurrence representations and recurrence evidence with the existing
  chroma/texture baseline across all five songs. Keep stream ablations separate.
- Do not optimize thresholds against provisional Overjoyed labels. Do not treat
  existing roles, model agreement or user answers as independent ground truth.
- Investigate whether shared harmony but different musical content remains
  conflated. Produce a reproducible comparison and explicit unresolved cases.
- If independent exact-recording evidence is unavailable, retain candidate as
  experimental; report inability to establish musical accuracy.

## Stage 3 — promotion decision and listening review (following wake)

- Review stage 2 evidence and run appropriate tests and cached cross-song checks.
- Promote only supported general improvements. Otherwise explicitly retain
  current algorithm and show experimental results separately in the listening
  comparison. Preserve roles and naming preferences.
- Original-session overwrites are authorized only for supported improvements;
  respect filesystem permissions, preserve unrelated data and raw provenance,
  and verify each write. Unsupported results must not be imported.
- Record final checkpoint, remaining work and schedule deletion.

## Execution rulings

- Continue in the already authorized dirty `codex/local-study` workspace; preserve
  unrelated changes. These stages produce isolated research artifacts first.
- The approved conversational three-stage outline is the scope. This file makes
  its interfaces and verification explicit; no new product scope is introduced.
- A scheduled start is approximate and depends on host availability. Queue start
  times enforce the minimum spacing even if the scheduler wakes early.
