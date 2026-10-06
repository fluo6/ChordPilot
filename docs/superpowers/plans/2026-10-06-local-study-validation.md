# Local Study validation

Implemented on `codex/local-study`, 2026-10-06. No new product dependencies.

## Verification

- Full JavaScript suite: **188/190 pass**. Both failures also occurred before implementation: Windows environment defaults in `web-app.test.js` expect Linux command names; the cleanup injection in `web-smoke-cli.test.js` does not match Windows paths.
- With those two baseline cases explicitly excluded: **188/188 pass**. Command: `node --test --test-skip-pattern="environment defaults parse without starting the HTTP server|smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails" tests/js/*.test.js`.
- `npm run test:web`: **114/116 pass**, with the same two baseline failures.
- `npm run test:python`: **68/68 pass**, including eight new real WAV/range-analysis tests; `py -3`, Python 3.9.5. NumPy and SciPy signal extraction executed. Installed SciPy warns about NumPy 1.26.4 being newer than its declared supported range; these checks nevertheless executed successfully.
- Focused model, workflow, and playback tests: **17/17 pass**. Review regressions were observed failing before their fixes.
- `git diff --check`: clean.

Real HTTP integration uploads a synthesized WAV, invokes the Python backend, checks C/E/G evidence and exact timestamps, saves history, clears caches, recreates storage, and reopens matching results and fingerprints. Adapter tests cover trusted source ownership, missing media after queueing, persisted associations, and old sessions. Desktop tests exercise the common service and IPC contract; native Electron UI was not driven on this host.

## Browser observations

An isolated localhost QA server used six seconds of synthesized C/E/G accompaniment and low E bass, separate from user projects. The browser showed:

- Default Bass + Other and explicit unavailable Vocals/Drums; exact 0.500–1.500 second analysis returned C/E, 97% chord confidence, and E bass evidence.
- Ctrl-click endpoints produced unsnapped 0.599–1.798 seconds; editing timestamps correctly marked the earlier evidence stale.
- Removing Bass and rerunning produced C while retaining the first C/E run. Run comparison labeled different inputs and showed source/settings/fingerprint differences.
- Save Session directly persisted both runs and corrected chord C/E. Reload/reopen restored the passage, selected first run, both history entries, sources, correction, and piano evidence.
- Loop Selection displayed its feedback in Local Study; Stop ended the preview. Original-source selection and independent Arrangement mix state are additionally covered by mocked Audio tests.

Native desktop playback, physical audibility, and actual browser background timing were not manually verified. Background boundary handling is covered by media-event tests with animation frames suspended. Transposed-preview isolation, late requests after song replacement, delayed play promises, dirty saves, malformed sessions, and source failure cases have automated coverage.

## Independent review

Fresh reviewer found no Critical issues and three Important issues, all fixed in one pass with failing-then-passing regressions:

1. Validate nested restored evidence, candidates/reasons, bass references, and fingerprint shapes; malformed runs cannot crash rendering and valid siblings remain.
2. Preserve successful history when editable range/sources become invalid; transitions use the last valid run inputs and a failed session flush cannot claim persistence or clear dirty state.
3. Add media `timeupdate`/`ended` boundary checks alongside animation frames, preserving looping/stopping when animation pauses.

Deferred Minor findings:

- Comparison inherits the shared table's 980px minimum width. It remains accessible through horizontal scrolling.
- The initial study draft uses standard frequency/candidate/simplify settings. New seeds customized song settings; the initial draft seeds the original song key.

## Execution decisions

- Work in the existing checkout on a feature branch with an initial diff snapshot, because an empty worktree would omit needed existing runtime fixes. Cost: careful staging is required.
- Use PowerShell-native progress files instead of Bash helpers on this Windows host. Cost: manual ledger maintenance.
- Continue despite the two recorded baseline failures, validating the unaffected suite separately. Cost: full `npm test` remains red on this host.
- Defer product commits until integration so unrelated existing edits can be excluded. Cost: intermediate task history lives in the execution record instead of separate commits.
- Implement selection and request/history UI together after their failing tests because they share the same module and captured-state contract. Cost: final review must cover both together.
- Preserve the baseline Windows failures and use an explicit exclusion for the remaining suite. Cost: the complete suite is not green.
- Keep the feature branch local without merging or publishing. Cost: integration remains a separate step.

The reviewer excluded unrelated baseline edits from judgment; arbitrary musical accuracy is not inferred from synthesized fixtures. Evidence supports the tested interval/source workflow and regression cases, with native playback limits stated above.

## Waveform gesture follow-up, 2026-10-06

Added direct waveform dragging to pan the zoomed viewport, selection dragging to move the entire interval, and visible edge handles to resize it. Edits preserve the 0.05-second minimum, clamp to original song bounds, stop study playback, mark previous evidence stale, and leave run snapshots intact. Modifier/toggle two-click selection retains priority. Pointer capture handles release outside the waveform; song/view ownership checks prevent an old gesture editing a replacement song.

Four new regressions were observed failing before implementation, then passed. Focused model/UI/playback: **21/21**. Full JavaScript suite with the same two explicitly excluded baseline failures: **192/192 pass**. No Python behavior changed.

Actual browser mouse drags at 2x zoom panned the viewport by 100px without changing 3–5 seconds, resized the end to 6.110 seconds and the start to 2.408 seconds, then moved the selection to 3.703–7.405 seconds while preserving its 3.702-second length. Subsequent Ctrl-click endpoints produced 5.993–12.004 seconds. The browser UI showed each corresponding timestamp update and the new gesture hint.
