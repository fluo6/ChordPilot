# Forever Love structure benchmark checkpoint

Recording: Leehom Wang, Forever Love (Clean Version), YouTube ULcmgv837MQ; local source duration approximately 300.617 seconds. User expects a bridge, based on vocal melody/pattern, chords and musical function. This expectation is evaluation feedback only.

## Protocol

Run the existing pinned SongFormer checkpoint and author decoder on full-mix audio. Capture the four existing MuQ/MusicFM feature streams and original head logits. Apply the unchanged contextual-role candidate to native occurrences. Do not insert a bridge, alter thresholds, use title branches, or read saved labels/references in inference. Extend only the current listening presentation; preserve the five-song cohort and original sessions.

The first GPU attempt exhausted memory during the full-song MuQ pass. A CPU fp32 run uses the same model weights, preprocessing and full context. CPU/GPU bit equivalence has not been established for this recording. The new wrapper changes device and adds lossless feature capture, not musical decision rules.

## Evaluation-only reference

Hooktheory's community transcription distinguishes Intro, Verse, Pre-Chorus, Chorus and Bridge: https://www.hooktheory.com/theorytab/view/leehom-wang/forever-love . This supports the existence of a bridge as a musical hypothesis, but does not supply independently verified timestamps for this exact recording. It is not read by either inference runner.

## Artifacts

- tmp/probe-songformer-cpu-features.py: CPU audio inference and feature capture.
- tmp/evaluate-additional-structure.py: frozen contextual rules and cache verification.
- tmp/add-forever-love-review.py: presentation-only metadata and bar hints.
- outputs/song-structure/additional-song-candidates/: reports and presentation snapshot.
- Original session SHA-256: e3fd5461364664611049c38c2fc76cc97879501138ef663a088b33e5c0a2810a.
- Source MP3 SHA-256: 4e1282a7e86e98d31047ecb0aa8131d5b73a43fd4fabc7c517989fcd43149190.

## Status

Completed. 62 Python structure tests and 23 JavaScript naming/review tests passed. Algorithm-derived bridge detected; detailed result below. No session changes or commit made.

## Completed result

CPU full-context inference finished in 303.29 seconds. Native SongFormer returns 20 occurrences, including two consecutive bridge passages: 220.3288–235.0894 seconds and 235.0894–247.3299 seconds (3:40.33–4:07.33 combined). Mean original bridge scores are 0.85785 and 0.77093; these are uncalibrated model scores, not probabilities of musical correctness. The contextual candidate makes zero role changes. No thresholds, boundaries or roles were tuned to the user's bridge expectation.

The broad form, collapsing adjacent equal roles for this prose summary only, is Intro → Verse → Pre-chorus → Chorus → Instrumental → Verse → Pre-chorus → Chorus → Bridge → Chorus → Outro. The listening page retains every native interval, including the repeated intro/verse/chorus/bridge rows. Whether those phrase divisions deserve separate section headings remains unresolved.

Verification: exact cached recomputation for Forever Love; original five-song contextual regression reproduced exactly; 62 Python and 23 JS tests passed; current page's first five tracks identical to the saved pre-extension manifest; all 27 historical protected hashes and the original Forever Love session hash unchanged. HTML embedded data equals the six-track current manifest. Browser confirms Forever Love, both comparison options and bridge times. No original sessions overwritten; no commit/push in this analysis turn.

The upstream wrapper emitted divide warnings for padded aggregate frames beyond actual coverage. Captured head logits passed the existing finite-value checks (permitted negative-infinity masked classes), and the native endpoint is 300.6120 against 300.6172 seconds of decoded audio. No tail extrapolation was added.

Review: http://127.0.0.1:3318/overjoyed-benchmark/review/?method=contextual-recurrence#forever-love
