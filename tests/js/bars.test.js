const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function load(chart = null) {
  const state = { chart, selectedIndex: -1, activeIndex: -1 };
  return loadScript("src/renderer/bars.js", [
    "findActiveBarIndex", "chartRows", "barChordText", "highestConfidenceChordChoice",
    "barLyricText", "lyricEntries", "lyricSummaryText", "lyricReferenceLinesForBar",
    "barRepeatText", "irealChordParts", "barEndTime", "beatsPerBar", "beatTimes",
    "evidenceRangeText", "detectedNotesText", "normalizePitchName", "pitchIndex",
    "chordToneSet", "detectedStrengthMap", "chordEvidenceText", "suggestionItemsForBar"
  ], {
    state,
    elements: {},
    document: { createElement: () => ({}) },
    hasChart: () => Boolean(state.chart?.bars?.length),
    secondsPerBar: () => 2,
    getChartDuration: () => Number(state.chart?.duration) || 0,
    formatSeconds: (value) => String(Math.round(Number(value) * 100) / 100),
    formatConfidence: (value) => `${Math.round(Number(value) * 100)}%`,
    PITCH_NAMES: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
    ENHARMONIC_TO_PITCH: { DB: "C#", "D#": "Eb", GB: "F#", "G#": "Ab", "A#": "Bb" },
    WHITE_KEYS: ["C", "D", "E", "F", "G", "A", "B"],
    BLACK_KEYS: [], PIANO_OCTAVES: []
  });
}

const chart = {
  duration: 8,
  tempo: 120,
  time_signature: "4/4",
  bars: [
    { number: 1, start: 0, section: "Verse", chord: "C", confidence: 0.6, lyrics: " one " },
    { number: 2, start: 2, section: "Verse", chord: "Am", confidence: 0.5, lyrics: "two" },
    { number: 3, start: 4, section: "Chorus", chord: "F", confidence: 0.7, lyrics: "" },
    { number: 4, start: 6, section: "Chorus", chord: "G", confidence: 0.8, lyrics: "four" }
  ]
};

test("active bar lookup handles boundaries, tolerance, and empty charts", () => {
  const b = load(structuredClone(chart));
  assert.equal(b.findActiveBarIndex(-1), 0);
  assert.equal(b.findActiveBarIndex(0), 0);
  assert.equal(b.findActiveBarIndex(1.98), 1);
  assert.equal(b.findActiveBarIndex(7), 3);
  assert.equal(load(null).findActiveBarIndex(2), -1);
});

test("chart rows split on capacity and section changes", () => {
  const b = load(structuredClone(chart));
  assert.deepEqual(plain(b.chartRows(4)).map((row) => row.map((item) => item.index)), [[0, 1], [2, 3]]);
  assert.deepEqual(plain(b.chartRows(1)).map((row) => row.map((item) => item.index)), [[0], [1], [2], [3]]);
});

test("highest confidence chord chooses alternatives and falls back cleanly", () => {
  const b = load();
  const bar = { chord: " C ", confidence: 0.3, alternatives: [{ chord: "Am", score: 0.7 }, { chord: "", score: 1 }] };
  assert.deepEqual(plain(b.highestConfidenceChordChoice(bar)), { chord: "Am", confidence: 0.7 });
  assert.equal(b.barChordText(bar), "Am");
  assert.equal(b.barChordText({ chord: "" }), "N.C.");
  assert.equal(b.highestConfidenceChordChoice({ chord: "C", confidence: "bad" }), null);
});

test("lyric helpers map manual bars and reference lines", () => {
  const manual = structuredClone(chart);
  manual.bars[0].lyrics_source = "manual";
  const b = load(manual);
  assert.equal(b.barLyricText(manual.bars[0]), "one");
  assert.equal(b.lyricEntries().length, 3);
  assert.equal(b.lyricEntries()[0].end, 2);
  assert.equal(b.lyricSummaryText(), "3 bars have manual lyrics");

  const referenced = structuredClone(chart);
  referenced.lyrics = { ok: true, source: "vocals", engine: "whisper", language: "en", language_mode: "detected", lines: [{ start: 1, end: 2.5, text: " hello ", confidence: 0.9 }] };
  const r = load(referenced);
  assert.deepEqual(plain(r.lyricEntries()), [{ start: 1, end: 2.5, text: "hello", confidence: 0.9 }]);
  assert.equal(r.lyricSummaryText(), "1 detected lines from vocals - detected en - whisper");
  assert.equal(r.lyricReferenceLinesForBar(0).length, 1);
  assert.equal(r.lyricReferenceLinesForBar(-1).length, 0);
});

test("repeat and iReal chord parsing cover common qualities", () => {
  const b = load();
  assert.equal(b.barRepeatText({ repeat_start: true, repeat_end: 2 }), "repeat start / 2x");
  assert.equal(b.barRepeatText({}), "");
  assert.deepEqual(plain(b.irealChordParts("Cmaj7/G")), { root: "C", quality: "", extension: "^7", bass: "G" });
  assert.deepEqual(plain(b.irealChordParts("Fmin9")), { root: "F", quality: "-", extension: "9", bass: "" });
  assert.deepEqual(plain(b.irealChordParts("Bdim7")), { root: "B", quality: "o", extension: "7", bass: "" });
  assert.deepEqual(plain(b.irealChordParts("Caug")), { root: "C", quality: "+", extension: "", bass: "" });
  assert.deepEqual(plain(b.irealChordParts("N.C.")), { root: "N.C.", quality: "", extension: "", bass: "" });
});

test("bar timing and beat grids use supplied beats or generated tempo", () => {
  const supplied = structuredClone(chart);
  supplied.beat_times = [0, 0.5, 1, 1.5, 2];
  const a = load(supplied);
  assert.equal(a.barEndTime(0), 2);
  assert.equal(a.barEndTime(3), 8);
  assert.equal(a.beatsPerBar(), 4);
  assert.deepEqual(plain(a.beatTimes()), supplied.beat_times);

  const generated = structuredClone(chart);
  generated.beat_times = [];
  assert.deepEqual(plain(load(generated).beatTimes()), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]);
});

test("evidence helpers normalize notes and describe detected strengths", () => {
  const b = load(structuredClone(chart));
  const bar = {
    chord: "Cmaj7/G",
    evidence: { range: [1.234, 2.345], source: "other stem", detected_notes: [{ note: "C", strength: 0.5 }, { note: "G#", strength: 0.25 }] },
    debug: { selection_reasons: ["fits key C"] }
  };
  assert.equal(b.evidenceRangeText(bar, 0), "1.23s to 2.35s");
  assert.equal(b.detectedNotesText(bar), "C 50%, G# 25%");
  assert.equal(b.normalizePitchName("G#4"), "Ab");
  assert.equal(b.pitchIndex("Db"), 1);
  assert.deepEqual([...b.chordToneSet("Cmaj7/G")], ["C", "E", "G", "B"]);
  assert.deepEqual(plain([...b.detectedStrengthMap(bar).entries()]), [["C", 0.5], ["Ab", 0.25]]);
  assert.match(b.chordEvidenceText(bar, 0), /other stem/);
  assert.match(b.chordEvidenceText(bar, 0), /Chord score/);
});

test("suggestion items preserve current-first order and deduplicate chords", () => {
  const b = load();
  const items = b.suggestionItemsForBar({ chord: "C", confidence: 0.4, alternatives: [{ chord: "Am", score: 0.8 }, { chord: "C", score: 0.9 }, { chord: "F", confidence: 0.6 }] });
  assert.deepEqual(plain(items).map((item) => [item.chord, item.score]), [["C", 0.4], ["Am", 0.8], ["F", null]]);
});
