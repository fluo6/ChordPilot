const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

function control(value = "") { return { value, checked: false, disabled: false }; }

test("analysis timing options default to Auto/beat and round-trip through controls", () => {
  const elements = {
    analysisPresetInput: control("general"), analysisPresetHint: {},
    chordTimingInput: control("auto"), chordGridInput: control("beat"), chordStabilityInput: control("detailed"),
    tailReductionInput: control("0"), tailHalfLifeInput: control("0.5"), overtoneWeightingInput: control("50"),
    analysisKeyInput: control(), minBpmInput: control("60"), maxBpmInput: control("190"), beatOffsetInput: control("0"), barPhaseInput: control("0"),
    onsetFrameInput: control("2048"), onsetHopInput: control("512"), chromaLowInput: control("65"), chromaHighInput: control("1800"),
    alternativesInput: control("6"), chordSourceInput: control("auto"), demucsModelInput: control("htdemucs"), useCacheInput: control(),
    simplifyChordsInput: control(), lyricsEnabledInput: control(), lyricsSourceInput: control("auto"), lyricsModelInput: control("tiny"), lyricsLanguageInput: control()
  };
  const { collectAnalysisOptions, applyAnalysisOptions, applyAnalysisPreset, updateAnalysisPresetState } = loadScript("src/renderer/shell.js", ["collectAnalysisOptions", "applyAnalysisOptions", "applyAnalysisPreset", "updateAnalysisPresetState"], { elements });
  assert.equal(collectAnalysisOptions().chord_timing, "auto");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  applyAnalysisOptions({bar_phase:2,beat_offset:.5});
  assert.equal(collectAnalysisOptions().bar_phase,2);
  assert.equal(collectAnalysisOptions().beat_offset,.5);
  assert.equal(collectAnalysisOptions().chord_stability, "detailed");
  assert.equal(collectAnalysisOptions().overtone_weighting, .5);
  applyAnalysisOptions({ overtone_weighting: .8 });
  assert.equal(collectAnalysisOptions().overtone_weighting, .8);
  applyAnalysisOptions({ overtone_weighting: 0 });
  assert.equal(collectAnalysisOptions().overtone_weighting, 0);
  applyAnalysisOptions({ chord_timing: "auto", chord_stability: "sustained" });
  assert.equal(collectAnalysisOptions().chord_stability, "sustained");
  assert.equal(elements.chordStabilityInput.disabled, false);
  applyAnalysisOptions({ chord_timing: 'auto', tail_reduction: .5, tail_half_life: .75 });
  assert.equal(collectAnalysisOptions().tail_reduction, .5);
  assert.equal(collectAnalysisOptions().tail_half_life, .75);
  applyAnalysisOptions({ chord_timing: "fixed", chord_grid: "half_beat" });
  assert.equal(collectAnalysisOptions().chord_timing, "fixed");
  assert.equal(collectAnalysisOptions().chord_grid, "half_beat");
  applyAnalysisOptions({}, { legacyDefaults: true });
  assert.equal(collectAnalysisOptions().chord_timing, "legacy");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  assert.equal(elements.chordGridInput.disabled, true);
  assert.equal(elements.chordStabilityInput.disabled, true);
  assert.equal(elements.tailReductionInput.disabled, true);
  assert.equal(elements.overtoneWeightingInput.disabled, true);
  assert.equal(collectAnalysisOptions().chord_stability, "detailed");
  applyAnalysisOptions({ known_key: "F", chord_source: "other", demucs_model: "mdx_extra", lyrics_enabled: true });
  applyAnalysisPreset("clean_guitar");
  const guitar = collectAnalysisOptions();
  assert.equal(guitar.chord_stability, "sustained");
  assert.equal(guitar.chord_grid, "beat");
  assert.equal(guitar.tail_reduction, .2);
  assert.equal(guitar.overtone_weighting, 0);
  assert.equal(guitar.known_key, "F");
  assert.equal(guitar.chord_source, "other");
  assert.equal(guitar.demucs_model, "mdx_extra");
  assert.equal(guitar.lyrics_enabled, true);
  assert.equal(elements.analysisPresetInput.value, "clean_guitar");
  applyAnalysisPreset("piano");
  assert.equal(collectAnalysisOptions().chord_grid, "half_beat");
  assert.equal(collectAnalysisOptions().chord_stability, "sustained");
  assert.equal(elements.analysisPresetInput.value, "piano");
  applyAnalysisPreset("rhythmic_keys");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  assert.equal(collectAnalysisOptions().chord_stability, "balanced");
  assert.equal(collectAnalysisOptions().tail_reduction, .2);
  assert.equal(collectAnalysisOptions().overtone_weighting, .5);
  assert.equal(collectAnalysisOptions().known_key, "F");
  assert.equal(collectAnalysisOptions().chord_source, "other");
  assert.equal(elements.analysisPresetInput.value, "rhythmic_keys");
  applyAnalysisPreset("reverb_fx");
  assert.equal(collectAnalysisOptions().tail_half_life, .8);
  assert.equal(collectAnalysisOptions().chord_stability, "balanced");
  assert.equal(elements.analysisPresetInput.value, "reverb_fx");
  applyAnalysisPreset("clean_guitar");
  elements.tailReductionInput.value = "30";
  updateAnalysisPresetState();
  assert.equal(elements.analysisPresetInput.value, "custom");
  applyAnalysisOptions(guitar, { legacyDefaults: true });
  assert.equal(elements.analysisPresetInput.value, "clean_guitar");
  applyAnalysisPreset("fast_changes");
  assert.equal(collectAnalysisOptions().chord_grid, "half_beat");
  assert.equal(collectAnalysisOptions().chord_stability, "detailed");
  assert.equal(collectAnalysisOptions().tail_reduction, 0);
  applyAnalysisPreset("general");
  assert.equal(collectAnalysisOptions().chord_grid, "beat");
  assert.equal(collectAnalysisOptions().overtone_weighting, .5);
  const beforeCustom = JSON.stringify(collectAnalysisOptions());
  applyAnalysisPreset("custom");
  assert.equal(JSON.stringify(collectAnalysisOptions()), beforeCustom);
});
