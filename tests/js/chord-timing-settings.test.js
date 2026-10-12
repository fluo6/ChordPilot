const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

function control(value = "") { return { value, checked: false, disabled: false }; }

test("analysis timing options default to Auto/beat and round-trip through controls", () => {
  const elements = {
    chordTimingInput: control("auto"), chordGridInput: control("beat"),
    analysisKeyInput: control(), minBpmInput: control("60"), maxBpmInput: control("190"), beatOffsetInput: control("0"),
    onsetFrameInput: control("2048"), onsetHopInput: control("512"), chromaLowInput: control("65"), chromaHighInput: control("1800"),
    alternativesInput: control("6"), chordSourceInput: control("auto"), demucsModelInput: control("htdemucs"), useCacheInput: control(),
    simplifyChordsInput: control(), lyricsEnabledInput: control(), lyricsSourceInput: control("auto"), lyricsModelInput: control("tiny"), lyricsLanguageInput: control()
  };
  const { collectAnalysisOptions, applyAnalysisOptions } = loadScript("src/renderer/shell.js", ["collectAnalysisOptions", "applyAnalysisOptions"], { elements });
  assert.equal(collectAnalysisOptions().chord_timing, "auto");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  applyAnalysisOptions({ chord_timing: "fixed", chord_grid: "half_beat" });
  assert.equal(collectAnalysisOptions().chord_timing, "fixed");
  assert.equal(collectAnalysisOptions().chord_grid, "half_beat");
  applyAnalysisOptions({}, { legacyDefaults: true });
  assert.equal(collectAnalysisOptions().chord_timing, "legacy");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  assert.equal(elements.chordGridInput.disabled, true);
});
