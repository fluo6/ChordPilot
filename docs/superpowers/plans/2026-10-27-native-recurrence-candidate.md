# Native occurrence recurrence candidate implementation plan

Goal: produce a reviewable audio-derived candidate with native SongFormer occurrences and conservative recurrence-assisted role hypotheses across all five recordings.

Existing authorization: user requests algorithm tuning, has authorized general algorithm upgrades and headless comparisons, and rejects manual answers in inference. Execute inline in the current experimental workspace; do not alter unrelated changes, frozen outputs, original sessions, or production detector.

Design: native boundaries are preserved exactly, including consecutive same-role occurrences and terminal silence. Native functional labels remain tentative model hypotheses rather than being suppressed by the old 0.8 cutoff. Silence retains its native class but displays as Unclassified. Recurrence identities are not inferred from role equality. No ABC fallback.

Alternatives considered: retuning the six-second decoder/merge rules has already damaged boundaries; retaining native predictions alone is an auditable baseline; native boundaries plus conservative acoustic role assistance is the selected experiment. User has authorized proceeding with tuning; these implementation choices are the implementer's.

Rule frozen before cross-song evaluation: use all eight existing raw/centered short/long MuQ/MusicFM ordered-distance views. A candidate donor must be the unique reciprocal nearest neighbor in every view, have a native class matching its frame-posterior winner with probability above 0.5, and belong to the same vocal-function eligibility set (verse/chorus/pre-chorus/bridge). The target must have no posterior class majority (maximum below 0.5). Equal-weight original target/donor posterior pooling must choose the donor's class, differ from the native target class, and improve the winner/runner-up margin. Otherwise retain native label. Compute all decisions from original evidence: no cascaded relabeling. These scores are not calibrated probabilities of correctness. Eight views are related ablations, not independent judges. Even unanimous nearest matches may be wrong.

Times, expected labels, title branches, references, original sessions, and this plan do not enter inference. Native source hashes and pinned feature/logit provenance must match. Fractional frame-overlap pooling handles posterior timing; reject mismatched caches and unsupported tails. Uncertainty and source decisions stay in output provenance.

## Tasks

- [x] Add synthetic tests for adjacent occurrences, uncertain versus confident targets, disjoint/no/tied neighbors, donor ambiguity, non-vocal roles, no propagation, invalid data, and immutability. Observe RED, implement scripts/testing/structure-native-recurrence.py, observe GREEN.
- [x] Add a cache-only runner in tmp/evaluate-native-recurrence.py using pinned native outputs, embeddings, logits and existing recurrence helper. Run all five songs, save separate artifacts, verify protected input hashes and deterministic recomputation. Inspect every changed role and report unresolved outcomes.
- [x] Extend the review builder with an optional candidate, preserving historical manifest and representation-manifest bytes. Write a separate current review manifest, add the candidate without editing old variants, verify rendered data, and inspect the candidate in browser.
- [x] Run focused and cross-song regressions, record compact validation. No production promotion or original-session overwrite without independently supported improvement.

Validation scope: unit tests establish algorithm invariants, cache regression establishes reproducibility, supplied sequence is development feedback only. Neither establishes musical accuracy. Exact recording annotations and held-out validation remain outstanding.
