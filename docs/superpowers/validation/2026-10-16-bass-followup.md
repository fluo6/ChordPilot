# Bass attacks, quiet notes, rhythm and fingering follow-up

## Bounded detector change

A stable, distinct 120 ms D2 at 8% of a preceding loud G1, after a 100 ms rest, was discarded by the existing `recent_level * 0.1` ringing guard. The new exception retains a note only when it differs in pitch from the preceding note, lasts at least 80 ms, has at least three primary 120 ms pitch frames, starts at least 60 ms after the preceding confirmed core, and has a 40 ms preceding level below one quarter of its own level. This permits a clear new attack after silence. Same-pitch quiet returns still extend a bounded prior tail or are suppressed. The periodicity, tuning, harmonic-support and noise gates are unchanged. The new synthetic regression failed before the change (`[G1, G2]`) and passes after (`[G1, D2, G2]`). A quiet legato note without a preceding energy valley can still be omitted.

## Existing recording checks

Re-ran whole-stem tracking on the local htdemucs Bass WAVs with the registered [Gravity](../../../tests/fixtures/chord-references/gravity.json) and [September](../../../tests/fixtures/chord-references/september.json) fixtures. Compared every event field to the saved `.chordpilot-data/benchmarks/gravity/calibration-september-final.json` and `.chordpilot-data/benchmarks/september/bass-final.json` tracks. Both are exactly unchanged: Gravity 246/246 events and September 599/599 events. This establishes no regression on those two saved tracks; it does not establish recovery of a real quiet phrase.

| Check | Result after change |
| --- | ---: |
| Gravity sustained interiors | 35/35 |
| Gravity passing interiors | 11/11 |
| Gravity selected attack points occupied by the expected pitch at the exact marked time | 1/8 |
| Gravity rejected-pitch attack windows | 0/6 with false attacks |
| September sustained interiors | 33/33 |
| September rejected-pitch attack windows | 0 with false attacks |
| September ambiguous score guide | 0/1, intentionally unscored |

Gravity's seven other marked attack points remain missed at their exact timestamps. At 15.00 s, for example, the D2 event begins at 15.045805 s; at 18.00 s, the C#2 event begins at 18.019048 s. The fixture explicitly warns that video highlights may lead stable audio pitch and that these points can be glides or rests. It supplies no verified onset/release intervals. The 120 ms analysis window and 20 ms hop also constrain timing. These points are useful diagnostics, not a defensible onset accuracy percentage. BAS-01 remains open for verified attacks, releases, legato and real quiet fills.

## Rhythm and fingering assessment

The renderer's existing focused checks cover 4/5-string pitch positions, a G1–D2–G2 phrase, sustained-note string/fret continuity across bars, rests, ties, 6/8 grouping, dense fills and exact score/TAB voice tick totals. All 22 focused JavaScript checks pass. The Gravity and September fixtures give selected sounding pitches and some rejection windows; neither gives note-by-note performed onset, duration, rest, string or fret ground truth. Gravity's score video supports the previously checked G1–D2–G2 suggestion (E3–A5–D5), but that one phrase cannot validate human-preferred shifts or 4-/5-string choices over the full arrangement. No renderer heuristic was changed without that evidence. BAS-02 remains open.

## Verification

- `test_bass.py`: 25 passed, including the new red/green quiet fast note and existing loud fundamentals, missing fundamentals, octave/upper bleed, ringing, releases and slides.
- `test_study.py`: 16 passed with a writable test temporary directory under `.chordpilot-data/benchmarks/`.
- `node --test tests/js/bass-view.test.js tests/js/bass-rhythm.test.js`: 22 passed.
- Python compile and explicit trailing-whitespace checks of all touched files: clean.

The reference media and baseline JSON remain unchanged. No claim is made about whole-song transcription accuracy or exact performance fingering.
