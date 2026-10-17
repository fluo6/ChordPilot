# Arrangement waveform vertical zoom and per-track height

Arrangement has independent Wave amplitude zoom (0.25×–8×) and overall Height zoom (0.75×–4×). Full Mix and each stem also have a bottom-edge resize grip, with pointer capture, keyboard Up/Down increments and double-click/Home reset. Track height is constrained to 64–720 pixels so mixing controls remain usable. Per-track sizes are stored before overall height zoom is applied.

The session UI saves normalized waveform display settings. Canvases redraw in place, preserving players, selection and horizontal pan. Display gain clamps peaks at the visual lane boundary; original waveform arrays, exports, analysis and audio volume are unaffected. Local Study continues using the shared renderer's default gain of one.

Verification on 2026-10-15:

- Four focused tests cover display-gain scaling and visual clipping, unchanged peak evidence, default/invalid settings, global-versus-individual sizing, and audio-setting isolation.
- JavaScript suite: 278 passed with the two established environment/cleanup exclusions.
- Browser: Height 1.5× produced three 108 px lanes. Dragging Bass enlarged it to 168 px while Full Mix/Other remained 108 px. Playback time, horizontal pan and 55% volume were unchanged.
- Double-click reset returned Bass to 72 px at Height 1×; two Down presses produced 96 px without seeking.
- Save/reopen restored Wave 4×, Height 1×, Bass 128 px and other lanes 72 px.
- Independent review found no remaining actionable issues.
- UI fixtures use synthetic waveform peaks over sample audio; they are not a transcription. Screenshot: `.chordpilot-data/benchmarks/notation/vertical-waveform-preview.jpg`.
