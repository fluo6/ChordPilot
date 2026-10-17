# Local Study arrangement overlap

Virtual Insanity's 19.1–19.8 s Local Study returns Bb13 with the saved Ebm/Other+Bass settings. The current arrangement timeline instead assigns 18.702–19.354 s to F#maj7 and 19.354–20.659 s to Cm7b5. A single Local Study result averages the whole selected interval, so it cannot describe that timeline disagreement by itself.

The tutorial frames sampled at 19.1, 19.35, and 19.6 s all highlight Cm7b5. Those highlights are approximate reference timing, not verified audio onsets. Short audio crops retain F# evidence through roughly 19.35 s; C grows thereafter, while the minor third becomes clearer around 19.65 s. The 19.354–19.8 s isolated crop currently returns low-confidence C13, whereas the full 19.354–20.006 s beat returns Cm7b5. These observations do not establish that two distinct chords were performed inside 19.1–19.8 s, nor do they justify forcing a chord label for the entire interval.

Local Study now shows **Arrangement chords in this selection** when at least two distinct, explicit chord events overlap the saved study range by 50 ms or more. It clips each event to the selected interval, merges adjacent instances of the same chord, and labels the displayed times as approximate estimates from the current song analysis. Choosing a part updates the adjustable study range; **Analyze Selection** then runs a separate audio analysis with the user's current settings. A bar-level fallback label is not treated as an event. Historical Local Study runs and measured evidence remain unchanged.

For 19.1–19.8 s, the view shows `19.100–19.354s · F#maj7` and `19.354–19.800s · Cm7b5` from the current arrangement. This is context for investigation, not an asserted ground-truth transcription or a new onset detector. Its contents can change when the arrangement is reanalyzed or manually edited. Without a current arrangement containing explicit chord events, the section is absent.

Verification: focused `study-model.test.js` and `study-ui.test.js` tests cover clipping, merging, absence of bar-only fallback, labeling, and selecting an event interval. No recognition formula, cache version, audio data, or reference fixture was changed.
