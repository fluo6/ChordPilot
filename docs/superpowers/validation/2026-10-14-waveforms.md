# Shared detailed waveforms

Analysis stem lanes and Local Study use `src/renderer/waveform.js` for identical peak aggregation and drawing. Each screen column retains the maximum source peak, preserving short attacks when zoomed out. Silence remains flat, and peaks use a solid teal envelope with lighter edges. Stem lanes are slightly taller.

New waveform extraction saves 100 peaks per second, with a 60,000-point limit per track. Existing saved sessions retain their old peaks until reanalysis. The analysis cache suffix changes independently of the file fingerprint, so cached stem audio remains reusable.

Validation: a synthetic two-minute waveform verifies separated short transients; JavaScript tests cover downsampling, zooming into silence, and invalid peak values. An isolated hidden Electron preview checked the shared renderer at both lane heights. Full suites: 107 Python and 244 JavaScript passed (the same two pre-existing JavaScript exclusions). `git diff --check` passed.
