# Forever Love: PDF check of the first sung verse

> Superseded: the user requires algorithm-only output. All PDF-guided labels and local setting overrides described below were removed from the saved session, and all 167 bars were regenerated from Other/Bass audio. The 8/8 figures below describe manual reference alignment and must not be reported as detector accuracy. See [the audio-only validation](2026-10-17-forever-love-audio-only.md) for the current result. The remaining text is a historical record of the rejected approach.

The supplied scanned score is `C:\Users\Fujia\Downloads\076_025_Forever Love_王力宏.pdf`, page 1. It names the men's key as A and gives 66 BPM. The saved recording is analysed in A at 133 BPM, effectively double time. Its first four musical measures occupy roughly 11.2–25.7 seconds. The score's first **sung** four-measure phrase starts near 25.7 seconds, matching session bars 15–22, not bar 7 as the earlier handover implied.

The printed chord degrees in that phrase are `1M7 → 1(2)/3 | 4M7 → 4mM7 | 1M7 → 1(2)/3 | 4M7 → 4mM7`. In A, the root sequence over the eight session bars is A, A, D, D, A, A, D, D. The score does not settle every extension or inversion used in this particular recording.

| Session bar | Start | Score root | Prior bar label | Saved bar label | Basis |
| --- | ---: | --- | --- | --- | --- |
| 15 | 25.658 s | A | C#m7/Ab | Amaj9 | Score-guided rootless reading; original acoustic C#m7/E → C#m7/Ab remains in debug cells |
| 16 | 27.462 s | A | Amaj9 | Amaj9 | Existing acoustic result |
| 17 | 29.267 s | D | Dmaj9 | Dmaj9 | Existing acoustic result |
| 18 | 31.071 s | D | F#m9 | Dmmaj7 | Balanced-mode acoustic reanalysis; later F#m9 event remains inspectable |
| 19 | 32.876 s | A | Amaj9 | Amaj9 | Existing acoustic result |
| 20 | 34.680 s | A | Amaj9 | Amaj9 | Existing acoustic result |
| 21 | 36.485 s | D | Dmaj7 | Dmaj7 | Existing acoustic result |
| 22 | 38.289 s | D | Dmmaj7 | Dmmaj7 | Existing acoustic result |

Before the update, the saved bar summaries matched 6/8 printed roots and matching-root events occupied 76.6% of this interval. A full balanced reanalysis of the first 30 session bars gave 7/8 bar roots but only 73.4% event-duration agreement; detailed mode gave 6/8 and 64.1%. Keeping sustained mode elsewhere, applying the balanced result only to bar 18, and labelling bar 15 from the PDF gives 8/8 bar roots and 87.5% matching-root event duration. These are agreement with an approximate score alignment, **not** independent audio-transcription accuracy. The acoustic evidence for bar 15 still favors C#m7/G# because A is weak and C#–E–G#–B are strong. It is also a plausible rootless Amaj9 upper structure in the score's context; the PDF-guided label is explicitly marked `Score` instead of receiving an acoustic confidence percentage.

The next score phrase, roughly 40.1–54.5 seconds (session bars 23–30), prints `5/6 → 2m7 → 2m6 | 5m/♭7 → 6(7+5) | 2m7 | 5(7+5) → 5m7`. The approximate root sequence is E, B, E, F♯, B, B, E, E. The prior saved bar summaries matched 4/8 of those roots. Balanced mode gives 5/8, and detailed mode gives 6/8 but with only 59.4% matching-root event duration. Two balanced results have independent acoustic support and were saved: bar 25 changes Eadd9 → **Em9**, consistent with the raw Em/B and Em/G cells; bar 26 changes Gmaj7 → **F♯7♯5**, consistent with the later F♯7♯5 cells. The saved following phrase matches 5/8 printed roots and 56.2% event duration. Bars 24, 28 and 30 still differ in root; their score alignment, passing chords and bass inversions need further evidence before changing labels.

The first verse's slash basses and exact extensions have not been verified against isolated low notes. Bar 18 still contains a later F#m9 event, so the printed Dm(maj7) may simplify a passing sonority in the recording. The clock/scene opening remains outside this check. No global detector setting or chord-scoring rule was changed, and all session bars except 15, 18, 25 and 26 were preserved. Before each atomic replacement, the previous session was backed up beside it; the final pre-save backup is `C:\Users\Fujia\Documents\ChordPilot-Data\王力宏 Leehom Wang - Forever Love (Clean Version) [ULcmgv837MQ].chordpilot-session.json.backup-pdf-following-20261017T033634Z`.

Validation: `forever-love-pdf-verse-check.py` records the three mode comparisons in `.chordpilot-data/benchmarks/forever-love-pdf-verse-check.json`. The saved session parses with 167 bars and includes the page, notation, source hash and original acoustic reading for the score-guided bar. The save scripts verify that only their listed bars changed and preserve audio, studies, analysis settings and UI state. The focused JavaScript tests for chord display, notation and events passed (23/23). The score-guided badge test confirms it shows `Score` rather than the old acoustic percentage.

## Follow-up: the remaining first-verse score ambiguities

The PDF's first sung phrase repeats at session bars 31–38 (54.53–68.97 s). All eight bar roots of that repeat already agree with the printed `1M7 → 1(2)/3 | 4M7 → 4mM7` pattern, and its matching-root events occupy 85% of the interval. This supports the 66-versus-133 BPM alignment independently of the first phrase's score-guided labels. The following phrase at bars 23–30 still had three root ambiguities. Inspecting original beat cells and the alternate sustained replay showed:

| Session bar | PDF notation | Acoustic finding | Saved reading |
| --- | --- | --- | --- |
| 24, 41.90–43.70 s | `2m7 → 2m6` (Bm7 → Bm6) after `5/6` | Three consecutive local winners at 42.124–42.801 s have B roots, with B3 strong. Sustained smoothing originally labelled them Emaj9. Later B/G♯ peaks support the sixth but do not independently establish all Bm6 tones. | Emaj9 carryover to 42.124, then score-guided Bm7 and Bm6. |
| 28, 49.12–50.92 s | `2m7` (Bm7) | B-D-F♯ starts the bar; the middle E/F♯/A figure can be its extended upper voice, then B returns. The detector had split this into Bm → F♯m7 → F♯7sus4. | Score-guided Bm7 → Bm11. |
| 30, 52.73–54.53 s | `5(7+5) → 5m7` (E7♯5 → Em7) | The detector's G6/9 and G6/9/B share G-B-D-E with Em7 and Em7/B; it cannot settle the implied root from the upper notes alone. An Amaj7 raw cell anticipates the next printed 1M7 measure. | E7♯5 carryover, score-guided Em7 → Em7/B, then Amaj7 pickup. |

The saved session now has bar labels **Bm7, Bm11 and Em7** at 24, 28 and 30. The first following phrase goes from 5/8 to 8/8 printed bar roots, and matching-root event duration goes from 54.7% to 84.0%. That increase is **agreement after explicit PDF guidance**, not a detector accuracy gain. Each guided event has a `score_reference` and no acoustic chord-confidence number; its original detected cells and alternatives remain in debug. Only those three bars changed in the second save. The `audio`, `studies`, `analysis` and `ui` objects remained identical, and a SHA-256-verified backup was created beside the session before atomic replacement.

A trial generic rule that preserved three-cell local root runs recovered B at 42.124 s, but also changed unrelated A-major and D-minor phrases in the same recording, so it was rejected. The production recognizer and global defaults remain unchanged. The diagnostic replay's bar-24 cell split was used only to place the explicit score-guided events; rerunning the replay with current production code returns the original E smoothing. The unsolved general problem is telling a rootless major/minor upper structure from a true chord change when the independent bass is absent. Reanalyzing the full chart will replace these PDF-guided readings; the saved version is the reviewable comparison point. The first-31-bar stem replay output and candidate-building scripts live in `.chordpilot-data/benchmarks/forever-love-pdf-tuning-*` and `prepare-forever-love-pdf-tuned.py`.
