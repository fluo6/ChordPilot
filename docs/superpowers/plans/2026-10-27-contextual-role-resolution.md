# Contextual role resolution experiment

User requests continued tuning to their Waste of Time sequence. Treat that sequence as development feedback, never inference input or independent ground truth. Preserve original/native results and previous experiments. Refresh the existing listening page; no annotation UI.

Diagnosis: native boundary layout is already the user's requested 13 occurrences. Two roles disagree. Isolated SSL neighbors disagree for the pre-chorus candidate, but the two-occurrence sequence and its successor agree across all eight views. For the late verse candidate, all eight isolated views already agree. The previous cross-class margin veto prevented that proposal without any calibration evidence supporting the veto.

Design: keep native boundaries and confident occurrence roles. Use original posteriors only. Targets must be vocal roles with posterior maximum below 0.5, donors must be vocal roles with a majority (>0.5) and a posterior winner agreeing with their native label. Equal-pool target/donor posteriors; accept only a unique winner agreeing with the donor. Do not require the new class margin to exceed the old class margin. Scores remain uncalibrated.

Two evidence routes, computed without role-dependent neighbor filtering:

1. Direct: unique reciprocal nearest occurrence in all eight existing raw/centered short/long feature views.
2. Successor context: unique reciprocal nearest two-occurrence window in all eight views, equal-weight current and following distances. Windows cannot overlap or wrap. The following occurrences must themselves be unanimous direct reciprocal matches, have matching strong native roles (>=0.8, existing strong-evidence threshold), and win their original posteriors. Ordered window cost must beat swapped-order cost in every view. No fixed Chorus/Verse transition rule.

If qualified routes propose different roles, retain native and report conflict. No cascading, role counts, forced form, title-specific branches, reference timestamps, letter caps or manual labels. Preserve silence raw, display Unclassified.

The current development recording informed this new hypothesis. Matching it will establish development-sequence agreement only, not general musical accuracy. The other four cached songs are regression cases, not independent accuracy labels.

- [x] Synthetic tests: contextual disambiguation, anchor confidence/role conflict/order, partial-view disagreement/ties, direct correction without old margin veto, protected strong and non-vocal roles, immutable evidence, non-cascading, no wrap/overlap, invalid inputs.
- [x] Implement separate scripts/testing/structure-contextual-roles.py. Leave prior helper/caches unchanged.
- [x] Verify old caches, pin their hashes in a separate input manifest, run new audio-derived logic on all five, record every change and exact recomputation.
- [x] Add distinct contextual candidate to existing comparison and retain every old variant. Validate historical integrity and current display; show Waste of Time with new candidate selected.
- [x] Fresh review, focused tests, cross-song invariants, explicit development-only sequence comparison, checkpoint.

User clarification: evaluate recurrence primarily through lead-vocal melody/pattern, supported by chords and conventional role. Current full-mix SSL candidate does not directly isolate these components; limitation recorded in final checkpoint.
