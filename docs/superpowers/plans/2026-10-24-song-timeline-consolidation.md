# Song / Timeline consolidation — 24 October 2026

Approved reference: downloaded `ChordPilot-Codex-Instructions-Song-Timeline-Merge.md` and `ChordPilot-Consolidated-Timeline-Song-Details-Concept.html`.

## Implementation

1. Preserve the current worktree files under `tmp/compact-ui/song-details-before/`.
2. Normalize the legacy `arrange` route at the shared route boundary; remove its sidebar item and duplicate Song panels.
3. Move the existing bound song, musical, source, tuning and export controls into one Song Details inspector. Use the existing audio session object for notes; keep unsupported metadata readonly.
4. Add the title info toggle and musical readouts. Alternate Song/Bar Detail in Timeline without changing the stored Bar Detail preference. Reuse the same overlay on Charts/Lab.
5. Keep Analysis Setup mutually exclusive with Song Details. Preserve stem lanes, all existing analysis operations, notation, instruments and persistence.
6. Run focused Node checks, request an independent source review, and regenerate the standalone review HTML.

## Validation boundary

Manual browser inspection is blocked by the browser tool's local-file URL security policy. No alternate browser, Electron, local server, CDP or indirect transport may be used to bypass it. Node VM state/DOM doubles are unit checks, not screenshots or browser QA. Actual visual validation at 1600/1366/600 and backend processing must be reported as unverified.
