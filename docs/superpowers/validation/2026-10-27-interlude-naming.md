# Interlude naming and section-name editing

The user chose the main ChordPilot application for immediate section-name selection. The existing Bar Settings editor now includes Interlude and applies the Section name selection immediately to its bound occurrence. Choosing a functional name switches the song to Named roles, clears that occurrence's competing custom label, and preserves its repeated group. Busy operations and stale chart/occurrence bindings reject the edit. The existing session save/reopen and detected-section reset paths carry this choice.

Edits remain in the existing manual overlay. Raw automatic predictions, occurrence boundaries and evidence stay unchanged. No detector rule or original session file was changed in this task.

## Convention and current six-song audit

Instrumental describes instrumentation; interlude describes placement/function between sections. A solo names a featured instrumental lead. Intro/outro can also be instrumental. These terms need not be forced into a one-to-one inference mapping.

Based on the current algorithmic section map, rather than independently verified listening:

| Recording | Native occurrences | Time | Naming assessment |
| --- | --- | --- | --- |
| Forever Love | 10 | 2:09.37–2:23.89 | Interlude is plausible: Chorus → instrumental passage → Verse. |
| Waste of Time | 7 | 2:02.64–2:21.37 | Interlude is plausible: Verse → instrumental passage → Pre-chorus. |
| 曾经是情侣 | 17–20 | 3:49.21–4:46.09 | One sustained interlude/solo region is plausible between choruses. Four native intervals are retained; no merge or solo claim made. |
| Ballad | 15 | 2:59.29–3:12.01 | Superseded by the 2026-10-28 ending investigation: evidence favors a top-level Outro covering occurrences 15–16; raw predictions remain unchanged. |
| Overjoyed | — | — | No separately classified Instrumental occurrence in the current candidate. This does not establish absence of instrumental material. |
| I Love You 3000 | — | — | No separately classified Instrumental occurrence in the current candidate. Same limitation. |

The Open University's [Instrumental interludes lesson](https://www.open.edu/openlearn/mod/oucontent/view.php?id=105700&section=11) illustrates such passages based on earlier verse/chorus material. This naming reference does not validate the exact boundaries or instrumentation of these recordings.

## Verification

- Two regression tests observed failing first: Interlude acceptance/persistence/reset, and immediate selected-occurrence UI edits with stale/busy guards.
- Full JavaScript suite: 470 passed, one skipped (run outside Windows sandbox for local server/downloader tests). Dedicated structure suite: 22 passed. Python structure/export suites: 23 passed.
- Headless actual application UI: selected Interlude for Forever Love occurrence 10, saved/reopened a lightweight QA session, verified the menu and projected heading, reset to native Instrumental, and compared unchanged raw analysis. No console errors.
- QA artifacts: outputs/section-naming-qa/verification.json, edited-session.json and interlude-editor.png. They are development copies, not overwritten user sessions.
- No inference recomputation was required for a naming-editor change. Session export projection accepts the additional role through the existing generic schema.
