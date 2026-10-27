# Native occurrence recurrence candidate checkpoint

Status: implemented as an unpromoted listening candidate, not a solved recognition algorithm. The user's expected Waste of Time sequence remains evaluation feedback only. No automatic role correction passed the frozen conservative rule; both disputed musical roles remain unresolved. No production detector change, original-session write, automation, commit, or branch change.

## What changed

- New pure helper scripts/testing/structure-native-recurrence.py retains native occurrence boundaries, raw labels and model posteriors. Role assistance requires all eight ordered SSL views to agree on a unique reciprocal neighbor, an uncertain vocal target, a majority-supported vocal donor, and a pooled role winner with improved margin. Decisions use original evidence only. No alphabet groups or melody identity inferred.
- tmp/evaluate-native-recurrence.py computes on pinned native outputs, embeddings and logits only, checks recording/model/cache hashes, blocks references/docs/session reads during inference, records provenance and verifies exact recomputation. Fractional posterior pooling uses the author decoder's 8.333 fps. Single-thread BLAS settings are enforced before NumPy initializes.
- Review option **Candidate · native sections + recurrence audit** retains consecutive choruses and maps terminal silence to Unclassified in every naming mode, retaining the raw class. Old variants and both historical manifests are unchanged. Current presentation is stored separately in current-manifest.json.
- Candidate mode hides the old v3 fine-interval listening evidence to prevent confusing its passage numbers with native occurrences. Native recurrence evidence and withheld proposals are available in candidate provenance. No candidate is selected globally by default; the `method=native-recurrence` query selects it for inspection.

## Results

| Recording | Native occurrences | Accepted role changes |
| --- | ---: | ---: |
| Overjoyed | 9 | 0 |
| I Love You 3000 | 10 | 0 |
| Waste of Time | 13 | 0 |
| Ballad | 16 | 0 |
| Liang Bo | 29 | 0 |

Waste of Time now has a review candidate retaining the native 13 occurrences rather than the old v3 pipeline's 16 coarse intervals. Displayed sequence:

Intro → Verse → Pre-chorus → Chorus → Chorus → Verse → Instrumental → Verse → Chorus → Chorus → Chorus → Outro → Unclassified

This is the native sequence, not a newly corrected one. The first pre-chorus, separate choruses, outro and terminal tail are preserved instead of v3 suppression/merging/splitting. That is structural preservation, not measured improved accuracy.

- 141.37–160.21: MusicFM's centered views favor the earlier pre-chorus, while MuQ favors chorus material. No unanimous donor; native Verse retained.
- 199.57–222.49: all eight views agree reciprocally with native verse occurrence 6 (98.28–122.64). Equal pooling favors Verse (0.49226), but the winner margin is 0.229786 versus native 0.231421. The frozen improvement requirement withholds relabeling; the proposal is displayed in the review description and retained in JSON. Do not lower a threshold simply to reproduce the supplied sequence.
- Native still over-fragments Ballad and Liang Bo. This candidate does not solve their phrasing or infer recurring melody groups. Native Overjoyed also differs from retained v3. The new option is not a universal replacement.

## Verification

- Observed RED for absent helper, then GREEN for synthetic behavior checks. Added withholding audit test observed RED then GREEN. Nine new tests cover preserved occurrences, confidence gates, ties/disagreement/nonreciprocity, non-vocal/silence handling, decoder mismatch, permutation/no-cascade, invalid input and singleton behavior.
- 49 Python structure tests and 23 JavaScript structure/naming/review tests passed.
- All five new reports and numerical arrays reproduced exactly after forcing single-thread BLAS inside the standalone runner. Reviewer reproduced a default-thread 1e-16 linkage difference beforehand; fixed without relaxing comparisons or modifying role rules.
- Both presentation verifiers passed. All 27 protected inputs, including five original sessions and historical prediction manifest, remain byte-identical. Historical representation-manifest remains SHA256 a1374657079398f1e49223b9e45b93d5f2699225471c60acfe3d48f560599086.
- Browser verified native candidate on all five tracks, correct native row counts, no console errors/warnings, terminal Unclassified in mixed and named modes, and old evidence hidden for candidate. Restored Named roles and Waste of Time. Saved browser-verification.json and review.png in outputs/song-structure/native-recurrence-candidate.
- Fresh read-only reviewer found two P2 issues: mixed-mode raw silence display and BLAS reproducibility. Both reproduced and fixed; final default-environment exact verification and browser checks passed. No threshold changes following the evaluation result.
- git diff --check passed with existing CRLF warnings. Other workspace changes preserved.

## Reproduction

```powershell
$env:PYTHONPATH="$PWD/tmp/structure-neural-deps"
C:/Python39/python.exe -m unittest discover -s tests/python -p 'test_structure*.py'
node --test tests/js/song-structure.test.js tests/js/structure-representation-review.test.js
C:/Python39/python.exe tmp/evaluate-native-recurrence.py --verify
C:/Python39/python.exe tmp/verify-native-recurrence-review.py
C:/Python39/python.exe tmp/verify-representation-review.py
```

Review URL: http://127.0.0.1:3318/overjoyed-benchmark/review/?method=native-recurrence#waste-of-time

Next substantive work requires validating musical role transfer rather than treating nearest embeddings or a small posterior-margin change as calibrated correctness. Independent exact-recording annotations and held-out songs are still missing. No 100% accuracy claim and no automatic promotion.
