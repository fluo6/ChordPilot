# Guitar intro stability

The Ballad intro collapsed into Fmaj9 under Auto changes, Half beat, Sustained, Tail Reduction 0%, Overtone Weighting 0%, Other/Accompaniment. Read-only reproduction used the saved session and its existing mdx_extra stems. No source audio or user session was changed.

Two causes interacted: the separated Bass stem was extremely quiet but independently normalized into confident root evidence; Sustained's wide context then allowed the later F harmony to replace earlier root changes. Local guitar evidence supports low G3, then C3, then F3. The automatic chart key was Am; the user confirmed an extended ii–V–I in F as the expected musical context.

## Changes

- Reject separated Bass below max(0.00001 RMS, 3% of accompaniment RMS). Local Study compares against every selected non-Bass source and excludes unusable Bass from combined note highlighting/playback evidence, while preserving its original spectrum.
- With unusable Bass, retain a strong, tuned low accompaniment pitch (MIDI ≤60, within 30 cents). The lowest detected candidate must have at least 15% strength; a weaker lower note prevents promoting an upper chord tone. This remains measured low-note evidence, and compatible inversions can still win.
- Use the same retained accompaniment pitches after tail/overtone processing for references, scoring and the keyboard. Grouped events average retained cell pitches by duration; removed tails cannot be reintroduced by recomputing a raw reference. Independent audible Bass retains its original root detector.
- Bound Balanced/Sustained context at two corroborating root/guide-tone observations. Clear thirds/sevenths protect local evidence from borrowed voicings. Nested pitch sets remain eligible for arpeggio consolidation; confirmed region roots receive the existing transition penalty as a bonus per beat. The original local winner always remains a valid DP state.
- Penalize suspended candidates when a clear third is measured but the proposed suspension is unsupported. Genuine suspended-chord regressions remain valid.
- Bump timed analysis cache identity to sub-bar-v4 and Local Study to v11; existing saved results require reanalysis. Help documents the evidence rules.

## Verification

Full Python suite: 130 passed. Full JavaScript suite: 259 passed with the two established exclusions (environment-default server startup and smoke CLI cleanup fixture). `git diff --check` passed. Independent review found no remaining actionable issues and independently passed 16 focused tests.

Regressions cover near-silent Bass under a synthetic extended ii–V–I guitar passage, measured audible Bass precedence, unsupported sus scoring, a local-winner guide-filter crash, Bass+Vocals audibility, and a subtracted C3 tail followed by D/F#/A in Fixed timing, Auto grouped events and Local Study. Existing piano arpeggio/change tests remain passing.

Read-only real-song checks with Tail Reduction and Overtone Weighting disabled:

| Song/context | Observed result |
| --- | --- |
| Ballad, screenshot-style 144 BPM grid, key F and Am | Gm9 until approximately 3.41 s, C-root passage, Fmaj9 from approximately 6.12 s. C quality varies between C7, Cmaj7 and C6; brief edge labels remain. |
| Ballad, older saved 152 BPM grid, key F | Main sequence Gm9 → C7 → Fmaj9; a brief C13 candidate is retained. Dominant labels of bars 5–8 remain Fmaj9, with brief edge labels. |
| Waste Of Time, 0.260–1.489 s, Bass + Other | Abmaj9, independent Bass reference |
| Waste Of Time, 56.260–57.260 s, Bass + Other | Eb7#9, independent Bass reference |
| Waste Of Time, 94.624–95.541 s, Bass + Other | Eb9sus4, independent Bass reference |

These comparisons verify preservation of root changes and prior examined chord results. They do not establish exact transcription of the C passage. Short-window pitch spill, changing guitar voicings, weak/omitted roots and tempo/beat alignment still affect quality and boundary labels; no song-specific progression was hardcoded.
