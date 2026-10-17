# Analysis presets

The instrument/texture dropdown under Analysis Options fills existing numeric controls. Presets apply only chord timing, grid, stability, tail reduction, tail half-life and overtone weighting. Key, tempo/onset controls, source stem, separation model, cache, chord display and lyrics settings remain as chosen. Selecting a preset does not trigger analysis or separation.

| Preset | Timing | Grid | Stability | Tail | Half-life | Overtone |
| --- | --- | --- | --- | ---: | ---: | ---: |
| General | Auto | One beat | Detailed | 0% | 0.5 s | 50% |
| Clean Guitar / Arpeggios | Auto | One beat | Sustained | 20% | 0.5 s | 0% |
| Piano / Sustained Keys | Auto | Half beat | Sustained | 20% | 0.5 s | 0% |
| Reverb / FX | Auto | Half beat | Balanced | 20% | 0.8 s | 50% |
| Fast Chord Changes | Auto | Half beat | Detailed | 0% | 0.5 s | 50% |

General exactly matches the existing defaults; no backend default or recognition rule changed. Clean Guitar uses the tested Ballad settings (with the user's key/source controls preserved). Piano and Reverb / FX are adjustable starting points rather than validated accuracy improvements for every instrument. Piano keeps overtone subtraction off to preserve weak voicing members. Reverb / FX uses a longer tail estimate and the existing default overtone weighting; effects are not all harmonic or exponential and this remains experimental.

Relevant control edits infer the matching preset or show Custom. Saved sessions keep the existing numeric options; opening them infers a label without overriding values. Legacy and arbitrary old configurations remain Custom. No preset ID is passed to Python or stored in recognition fingerprints, so equivalent settings continue to share the existing cache identity. Newly created Local Studies inherit filtering settings from analysis; existing studies keep their saved settings. Local Study does not apply song timing/stability settings to its single selected window.

## Validation

- The preset regression failed before implementation because applyAnalysisPreset was absent. It now checks all five presets, key/source/model/lyrics preservation, Custom after editing, saved-value restoration, unchanged General defaults and Custom as a no-op.
- Full JavaScript suite: 261 passed with the same two established exclusions. No Python scorer or backend files were changed in this task.
- Independent read-only review passed 31 focused preset and Local Study UI/model tests and found no actionable issue.
- Isolated browser QA at localhost:3107 loaded the existing real_song_30s.mp3 fixture. Verified all five presets, selected key F retained throughout, and 20% → 30% tail edits displaying Custom. Checked the layout and captured `.chordpilot-data/benchmarks/presets-ui/presets-preview.jpg`.
- Help documents exact values, experimental status, reanalysis behavior and Local Study inheritance. `git diff --check` passed.

The preceding real-audio validation is in `2026-10-14-overjoyed-reference.md`: Waste Of Time's reported extended/suspended chords and Ballad's Gm9/C13/Fmaj9 passage were preserved by the shared scorer. Preset availability itself does not establish new accuracy figures. Add further instrument-labelled reference comparisons before claiming a preset is better generally.
