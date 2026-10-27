# Overjoyed structure benchmark and tuning

Continue the user-approved multi-stage structure work, specifically evaluation and semantic feasibility. User instruction on 2026-10-26: use the existing Overjoyed recording, investigate missing intro and wrong verse/chorus, allow content-based A/B/C, proceed slowly and preserve compact checkpoints.

## Constraints

- Predictions must come from audio-derived evidence. No song-title branches, reference timestamps, fixed song-form templates or manual section overlays in inference.
- Reference annotations are evaluation inputs only. Overjoyed is a development benchmark after tuning, never a held-out accuracy claim.
- Measure boundaries, recurring musical content and functional roles separately. A/B/C describes content, not an alias for Verse/Chorus.
- A complete, independently checked reference is required before claiming 100%. A provisional score-aligned annotation cannot establish that claim.
- Preserve raw model outputs and unrelated session data. The existing runtime detector remains unchanged until a candidate has evidence of improvement.
- Save a compact evidence checkpoint after each stage. Automatic conversation compaction is controlled by the host, not an available tool.

## Approach

The unchanged All-In-One label head already predicts Intro in the opening. First examine its decoding rather than replacing or training a model. Compare the unchanged decoder with a musically scaled peak window using the identical activations. If boundary decoding is insufficient, test content recurrence separately using installed audio libraries; do not repair wrong semantics with position-only guesses.

Alternatives: rerun matched separation if the input audit finds a mismatch; replace the model only after the decoder experiment. Existing Overjoyed stems prove to be 44.1 kHz stereo HTDemucs, despite the prior experiment's incorrect blanket MDX provenance note.

## Stages

- [x] 1. Reproduce the current output, research musical form and audit preprocessing. Save `docs/superpowers/validation/2026-10-26-overjoyed-structure.md`.
- [x] 2. Create an explicitly provisional evaluation reference aligned to this recording's musical grid, with source attribution and uncertainty. Extend the existing evaluator to score semantic agreement and abstentions, with a failing regression first.
- [x] 3. Run one decoder experiment on cached activations; compare against the frozen baseline and reference. Preserve every candidate, parameter and result.
- [ ] 4. If needed, independently investigate content recurrence and uncertain roles. Run the same selected rule on the other four songs for regressions; those songs currently have no verified accuracy reference.
- [x] 5. Inspect the measured result, update the review artifact and import the reviewed Overjoyed-only improvement with its provenance and raw outputs. Keep unresolved errors explicit. Do not equate successful import or tests with recognition accuracy.

## Current checkpoint

The multi-stage candidate and two cross-song operational checks are complete. Stage 4's broader quality work remains open. The independent review approved only the controlled Overjoyed import; its guarded write and fresh verification passed. Ruling: keep this as a headless development experiment and saved Overjoyed result, because cross-song role coverage is weak and the reference is provisional. No product default/runtime rollout or 100% semantic claim. See validation checkpoints 7–8 for the measured results, unresolved work and exact original file updated.

## Verification

Use the existing structure evaluator and partition validator. Add tests for wrong roles with identical boundaries, unknown-role coverage, extra boundaries and recording identity. For a changed decoder, synthetic early/closely spaced sections must fail before the fix. Run affected Python tests and compare exact source-time partitions on all five songs. Reuse the saved media and comparison page.

## Follow-up: preserve occurrence evidence (user-authorized algorithm upgrade)

The same harmonic progression can occur under a verse and a chorus. The v2
consensus pools their functional logits and erases strong occurrence predictions.
Keep the existing model and content grouping; change only functional consensus.
Direct scores at the existing 0.8 threshold take priority. A weaker occurrence may
borrow evidence only when every eligible content peer has the same winning role.
No lower threshold, song-form template, reference input, or additional model.
This is a headless experimental upgrade; product rollout still needs quality data.

- [x] Reproduce with a synthetic shared-content verse/chorus case; add a pure
  `consensus_roles(probabilities, clusters, eligible, threshold=0.8)` helper in
  `scripts/testing/structure-role-consensus.py`. Test conflicting winners,
  compatible weak evidence, non-vocal exclusions, and invalid probabilities.
- [x] Replace only the pooling block in `tmp/probe-structure-consensus.py`; emit
  v3 alongside preserved v2 outputs, with per-occurrence decision provenance.
- [x] Compare frozen Overjoyed metrics; run all five audio-derived partitions,
  report operational checks separately from unmeasured cross-song accuracy.
- [x] Run affected tests, obtain a fresh review, and update listening comparison
  and evidence checkpoint. Only replace a saved session if the candidate changes
  it and the evidence supports that replacement. Preserve unrelated data.

Ruling: continue inline in the existing dirty workspace, preserving all existing
work. This is an incremental fix within the approved experiment, not a new product
design or a request to commit the unrelated branch changes.

Final follow-up result: all five v3 partitions reproduced with annotation/session
reads actively blocked. Overjoyed metrics are identical to v2; original unchanged.
I Love You 3000's lost direct roles are restored (55.95% coverage versus 20.32%).
Other-song quality remains unmeasured; five recordings are available in the
listening comparison. The current model/descriptor combination still struggles
with melody identity and weak functional evidence. Next model work should target
those signals, not lower the acceptance threshold to inflate named-role coverage.
