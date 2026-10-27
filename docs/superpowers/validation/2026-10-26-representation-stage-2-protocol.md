# Stage 2: procedure fixed before inspecting feature comparisons

This protocol is frozen before computing any five-song feature distances.
The accepted three-stage plan supplies the scope. Stage 2 produces evidence,
not a promoted partition. No reference labels are loaded or used for tuning.

1. Process Overjoyed, then the other four recordings in queue order. Read only
   start/end from retained fine occurrences into the comparison calculation.
   Validate source and cache hashes. Keep all boundaries and roles unchanged.
2. For each of four independent native streams, average the available feature
   frames into 16 equal-duration bins per occurrence, weighting fractional
   frame overlap. Clip only the sub-frame uncovered tail; record coverage.
   Never extrapolate. Normalize each bin to unit length.
3. Compute mean ordered-bin cosine distance, plus the existing baseline's
   0.1 * absolute log duration ratio. No DTW, pitch shifting, role features,
   inferred lyrics, title logic, target counts or threshold fitting.
4. Report an uncentered and a recording-mean-centered version of each stream.
   Centering subtracts the duration-weighted whole-recording mean before bin
   normalization. Both are ablations; do not select a winner from these songs.
   A zero bin is uninformative (distance 1), never an exact-match shortcut.
5. Compare against the cached fine chroma/texture distance matrix. Export all
   distances, per-occurrence nearest-neighbor ranks and reciprocal-neighbor
   pairs. Ties remain ties. Reciprocal pairs are evidence to inspect, not
   confirmed repeats or labels. They cannot supply complete repeated families.
6. Export the full complete-link hierarchy per view, without cutting it into
   a selected group count or transferring chroma's 0.12 cutoff to embeddings.
   Report unanimous reciprocal pairs across the four streams separately for
   each normalization; disagreement is unresolved, not a rejection of music.
7. After distances are fixed, join baseline group/role metadata for review only.
   List every baseline same-group pair and its ranks in all views, plus pairs
   whose accepted occurrence roles differ. Role differences flag listening
   questions; they neither prove nor disprove recurring musical material.
8. Export a reproducible JSON/NPZ evidence bundle and a concise comparison.
   Validate synthetic ordered/reversed patterns, fractional-bin arithmetic,
   recording-offset removal, zero vectors, ties and hierarchy behavior.
   Verify five-song rerun equality and protected inputs/sessions unchanged.

Ruling: retain the full hierarchy instead of inventing an embedding threshold —
there is no independently labeled validation set for selecting a cut. The cost
is no deployable new ABC partition yet. Coverage and model agreement are not
musical accuracy. Short/long streams are correlated features of the same model,
not independent judges. Long context may encode neighboring passages. Neither
cosine distance nor these representations establishes melody equivalence or
key invariance. Independent exact-recording annotations are still required.

Ruling: use the existing queue/checkpoints as the execution ledger and the
authorized dirty branch as the workspace, as the parent plan already specifies.
The three-stage plan remains open; whole-scope review belongs to stage 3.
