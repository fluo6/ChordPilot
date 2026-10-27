# Structure evaluation references

The Overjoyed development reference is **provisional**, derived from published
section analyses and mapped to the saved recording grid. It has not received a
complete independent listening audit and cannot substantiate a 100% accuracy claim.
No independently verified complete-song references have been added yet. The
acoustic tests use generated signals with known transitions; they do not establish
real-song recognition accuracy. Keep automatic structure opt-in until the release
gate in the approved design has independent evidence.

Reference JSON uses `duration` and a complete `segments` list of
`{start, end, group}` source-time intervals. Include source/version, annotator,
annotation method, uncertainty and development/evaluation split metadata.
Adjacent intervals share exactly the same boundary value. Keep arbitrary group
letters consistent within each recording; they do not stand for musical roles.

Choose the song-separated development/evaluation split before tuning on real
recordings. Never pass reference labels into analysis. The benchmark reads its
reference only after generating predictions, and evaluates automatic segments
rather than saved manual corrections.

Example command using an existing chart as the grid:

```powershell
python scripts/testing/structure-benchmark.py --audio song.wav --grid saved-session.json --reference independently-annotated.json --output tmp/structure-report.json
```

Omit `--reference` for a smoke run. A smoke run has no accuracy score. Supply
`--prediction` instead of `--audio` to score a saved automatic result without
running inference. Boundary metrics exclude song endpoints and match one-to-one
at 0.5/3 seconds. Group metrics use continuous duration-weighted pairwise
agreement and are invariant to renaming A/B/C.

When roles are annotated, the report also gives duration agreement and explicit
coverage. Unknown roles are abstentions, not correct answers. Reference and
prediction content hashes must match when both are supplied.
