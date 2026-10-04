const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../vergence-core.js");

test("debug difficulty hotkeys map the supported keys", () => {
  assert.equal(core.getDebugDifficultyDirection({ code: "BracketLeft", key: "[" }), -1);
  assert.equal(core.getDebugDifficultyDirection({ code: "Minus", key: "-" }), -1);
  assert.equal(core.getDebugDifficultyDirection({ code: "Minus", key: "_" }), -1);
  assert.equal(core.getDebugDifficultyDirection({ code: "NumpadSubtract", key: "-" }), -1);

  assert.equal(core.getDebugDifficultyDirection({ code: "BracketRight", key: "]" }), 1);
  assert.equal(core.getDebugDifficultyDirection({ code: "Equal", key: "=" }), 1);
  assert.equal(core.getDebugDifficultyDirection({ code: "Equal", key: "+" }), 1);
  assert.equal(core.getDebugDifficultyDirection({ code: "NumpadAdd", key: "+" }), 1);

  assert.equal(core.getDebugDifficultyDirection({ code: "KeyA", key: "a" }), 0);
});

test("debug difficulty hotkeys ignore modified keypresses", () => {
  assert.equal(core.getDebugDifficultyDirection({ code: "Equal", key: "=", metaKey: true }), 0);
  assert.equal(core.getDebugDifficultyDirection({ code: "Minus", key: "-", ctrlKey: true }), 0);
  assert.equal(core.getDebugDifficultyDirection({ code: "BracketRight", key: "]", altKey: true }), 0);
  assert.equal(core.getDebugDifficultyDirection({ code: "Minus", key: "-", ctrlKey: false }), -1);
});

test("vergence scheduling behaves as expected", () => {
  assert.equal(core.resolveRoundVergence("alternate", 1, 0), "convergence");
  assert.equal(core.resolveRoundVergence("alternate", 2, 0), "divergence");
  assert.equal(core.resolveRoundVergence("divergence", 3, 0), "divergence");
  assert.equal(core.resolveRoundVergence("vergence_up", 4, 0), "vergence_up");
  assert.equal(core.resolveRoundVergence("facility", 1, 0), "convergence");
  assert.equal(core.resolveRoundVergence("facility", 2, 0), "divergence");
  assert.equal(core.resolveRoundVergence("smooth", 1, 0), "convergence");
  assert.equal(core.resolveRoundVergence("smooth", 5, 0), "convergence");

  const sequenceA = Array.from({ length: 8 }, (_, index) => core.resolveRoundVergence("random_jump", index + 1, 12345));
  const sequenceB = Array.from({ length: 8 }, (_, index) => core.resolveRoundVergence("random_jump", index + 1, 12345));
  assert.deepEqual(sequenceA, sequenceB);
  assert(sequenceA.every(mode => mode === "convergence" || mode === "divergence"));
  assert(sequenceA.includes("convergence"));
  assert(sequenceA.includes("divergence"));
});

test("vergence vectors respect axis and vertical polarity", () => {
  assert.deepEqual(core.getVergenceVector("convergence", "standard"), { x: 1, y: 0 });
  assert.deepEqual(core.getVergenceVector("divergence", "standard"), { x: -1, y: 0 });
  assert.deepEqual(core.getVergenceVector("vergence_up", "standard"), { x: 0, y: 1 });
  assert.deepEqual(core.getVergenceVector("vergence_down", "standard"), { x: 0, y: -1 });
  assert.deepEqual(core.getVergenceVector("vergence_up", "flipped"), { x: 0, y: -1 });
  assert.deepEqual(core.getVergenceVector("vergence_down", "flipped"), { x: 0, y: 1 });
});

test("red lens side flips horizontal disparity but not vertical", () => {
  assert.deepEqual(core.getVergenceVector("convergence", "standard", "right"), { x: 1, y: 0 });
  assert.deepEqual(core.getVergenceVector("divergence", "standard", "right"), { x: -1, y: 0 });
  assert.deepEqual(core.getVergenceVector("convergence", "standard", "left"), { x: -1, y: 0 });
  assert.deepEqual(core.getVergenceVector("divergence", "standard", "left"), { x: 1, y: 0 });
  assert.deepEqual(core.getVergenceVector("vergence_up", "standard", "left"), { x: 0, y: 1 });
  assert.deepEqual(core.getVergenceVector("vergence_down", "flipped", "left"), { x: 0, y: 1 });
});

test("difficulty and PD conversions round trip", () => {
  const monitorWidthIn = 24;
  const viewDistanceIn = 16;
  const screenWidthPx = 1920;
  const baseTotalSplitPx = 8;
  const splitGainPxPerStep = 7;
  const targetPd = 30;

  const steps = core.pdToDifficultySteps(
    targetPd,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    splitGainPxPerStep,
    baseTotalSplitPx
  );
  const recoveredPd = core.difficultyToPd(
    steps,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    baseTotalSplitPx,
    splitGainPxPerStep
  );

  assert(Math.abs(recoveredPd - targetPd) < 1e-9);

  // A nonzero base split is on-screen demand, so it must count at zero difficulty.
  const basePd = core.splitPxToPd(baseTotalSplitPx, monitorWidthIn, viewDistanceIn, screenWidthPx);
  assert(Math.abs(core.difficultyToPd(0, monitorWidthIn, viewDistanceIn, screenWidthPx, baseTotalSplitPx, splitGainPxPerStep) - basePd) < 1e-9);
  assert.equal(core.difficultyToPd(0, monitorWidthIn, viewDistanceIn, screenWidthPx, 0, splitGainPxPerStep), 0);
  assert.equal(core.pdToDifficultySteps(basePd / 2, monitorWidthIn, viewDistanceIn, screenWidthPx, splitGainPxPerStep, baseTotalSplitPx), 0);
});

test("pixel-to-prism-diopter conversion is anchored to an absolute value", () => {
  // 24in wide over 1920px is 0.3175 mm/px; 100px of split at a 16in (0.4064m)
  // distance is 3.175cm of displacement, i.e. 3.175 / 0.4064 = 7.8125 PD. A
  // round-trip test alone would hide a systematic units slip (e.g. cm vs mm),
  // so pin the absolute number here.
  assert(Math.abs(core.getMmPerPixel(24, 1920) - 0.3175) < 1e-9);
  assert(Math.abs(core.splitPxToPd(100, 24, 16, 1920) - 7.8125) < 1e-9);
  assert(Math.abs(core.pdToSplitPx(7.8125, 24, 16, 1920) - 100) < 1e-9);

  // Degenerate inputs return 0 rather than Infinity or NaN.
  assert.equal(core.getMmPerPixel(0, 1920), 0);
  assert.equal(core.splitPxToPd(100, 24, 0, 1920), 0);
  assert.equal(core.pdToSplitPx(10, 24, 16, 0), 0);
});

test("PD deltas convert to difficulty steps that reproduce the same PD change", () => {
  const monitorWidthIn = 24;
  const viewDistanceIn = 16;
  const screenWidthPx = 1920;
  const baseTotalSplitPx = 8;
  const splitGainPxPerStep = 7;
  const startSteps = 10;

  for (const pdDelta of [0.75, -1, 2.5]) {
    const deltaSteps = core.pdDeltaToDifficultySteps(
      pdDelta,
      monitorWidthIn,
      viewDistanceIn,
      screenWidthPx,
      splitGainPxPerStep
    );
    const before = core.difficultyToPd(
      startSteps, monitorWidthIn, viewDistanceIn, screenWidthPx, baseTotalSplitPx, splitGainPxPerStep
    );
    const after = core.difficultyToPd(
      startSteps + deltaSteps, monitorWidthIn, viewDistanceIn, screenWidthPx, baseTotalSplitPx, splitGainPxPerStep
    );
    assert(Math.abs(after - before - pdDelta) < 1e-9, `pdDelta ${pdDelta} reproduced`);
  }

  assert.equal(core.pdDeltaToDifficultySteps(0, monitorWidthIn, viewDistanceIn, screenWidthPx, splitGainPxPerStep), 0);
  assert.equal(core.pdDeltaToDifficultySteps(Number.NaN, monitorWidthIn, viewDistanceIn, screenWidthPx, splitGainPxPerStep), 0);
});

test("scoring events accumulate per-exercise metrics", () => {
  const metrics = Object.create(null);

  assert.deepEqual(core.recordScoringEvent(metrics, "correct", "Convergence"), {
    exerciseKey: "convergence",
    scoreDelta: 1,
    exerciseScore: 1
  });
  core.recordScoringEvent(metrics, "correct", "convergence");
  core.recordScoringEvent(metrics, "wrong", "convergence");
  core.recordScoringEvent(metrics, "timeout", "divergence");
  core.recordScoringEvent(metrics, "skip", "");

  core.recordScoringEvent(metrics, "suppression", "convergence");

  assert.deepEqual(metrics.convergence, { score: 1, correct: 2, wrong: 1, skip: 0, timeout: 0, suppression: 1 });
  assert.deepEqual(metrics.divergence, { score: -1, correct: 0, wrong: 0, skip: 0, timeout: 1, suppression: 0 });
  assert.deepEqual(metrics.unassigned, { score: -1, correct: 0, wrong: 0, skip: 1, timeout: 0, suppression: 0 });

  const suppression = core.recordScoringEvent(metrics, "suppression", "divergence");
  assert.equal(suppression.scoreDelta, 0);
  assert.equal(metrics.divergence.score, -1);

  assert.equal(core.getExerciseScore(metrics, " CONVERGENCE "), 1);
  assert.equal(core.getExerciseScore(metrics, "vergence_up"), 0);
  assert.equal(core.getExerciseScore(metrics, ""), 0);

  const unknown = core.recordScoringEvent(metrics, "mystery", "convergence");
  assert.equal(unknown.scoreDelta, 0);
  assert.equal(metrics.convergence.score, 1);
});

test("staircase steps up after N consecutive correct and resets on error", () => {
  let state = core.advanceStaircase(0, "correct", 3);
  assert.deepEqual(state, { consecutiveCorrect: 1, direction: 0 });
  state = core.advanceStaircase(state.consecutiveCorrect, "correct", 3);
  assert.deepEqual(state, { consecutiveCorrect: 2, direction: 0 });
  state = core.advanceStaircase(state.consecutiveCorrect, "correct", 3);
  assert.deepEqual(state, { consecutiveCorrect: 0, direction: 1 });

  assert.deepEqual(core.advanceStaircase(2, "wrong", 3), { consecutiveCorrect: 0, direction: -1 });
  assert.deepEqual(core.advanceStaircase(1, "timeout", 3), { consecutiveCorrect: 0, direction: -1 });
  assert.deepEqual(core.advanceStaircase(0, "skip", 3), { consecutiveCorrect: 0, direction: -1 });

  assert.deepEqual(core.advanceStaircase(0, "correct", 1), { consecutiveCorrect: 0, direction: 1 });
  assert.deepEqual(core.advanceStaircase(5, "correct", 0), { consecutiveCorrect: 0, direction: 1 });
  assert.deepEqual(core.advanceStaircase(Number.NaN, "correct", 3), { consecutiveCorrect: 1, direction: 0 });
});

test("break/recovery pairs track per exercise", () => {
  const tracker = Object.create(null);

  assert.equal(core.recordRangeBreak(tracker, "Convergence", 24), true);
  assert.equal(core.recordRangeBreak(tracker, "convergence", 26), false);
  assert.equal(core.recordRangeRecovery(tracker, "divergence", 10), null);
  assert.deepEqual(core.recordRangeRecovery(tracker, "convergence", 18), { breakPd: 24, recoveryPd: 18 });
  assert.equal(core.recordRangeRecovery(tracker, "convergence", 17), null);

  assert.equal(core.hasPendingRangeBreak(tracker, "convergence"), false);
  core.recordRangeBreak(tracker, "convergence", 30);
  assert.equal(core.hasPendingRangeBreak(tracker, "convergence"), true);
  assert.equal(core.hasPendingRangeBreak(tracker, "divergence"), false);
  core.recordRangeRecovery(tracker, "convergence", 22);
  assert.equal(core.hasPendingRangeBreak(tracker, "convergence"), false);
  core.recordRangeBreak(tracker, "convergence", 27);
  core.recordRangeRecovery(tracker, "convergence", 20);

  assert.deepEqual(core.getBestRangePair(tracker, "convergence"), { breakPd: 30, recoveryPd: 22 });
  assert.equal(core.getBestRangePair(tracker, "divergence"), null);
  assert.equal(core.recordRangeBreak(tracker, "convergence", Number.NaN), false);

  // A recovery at or above the break is not physiologic and is rejected; the
  // break stays pending until a genuinely lower recovery arrives.
  assert.equal(core.recordRangeBreak(tracker, "divergence", 15), true);
  assert.equal(core.recordRangeRecovery(tracker, "divergence", 15), null);
  assert.equal(core.hasPendingRangeBreak(tracker, "divergence"), true);
  assert.equal(core.recordRangeRecovery(tracker, "divergence", 18), null);
  assert.equal(core.hasPendingRangeBreak(tracker, "divergence"), true);
  assert.deepEqual(core.recordRangeRecovery(tracker, "divergence", 11), { breakPd: 15, recoveryPd: 11 });

  // A break at or below zero demand is not a measurement (no lower recovery
  // could ever answer it), so it is rejected and never left pending.
  assert.equal(core.recordRangeBreak(tracker, "vergence_up", 0), false);
  assert.equal(core.hasPendingRangeBreak(tracker, "vergence_up"), false);
  assert.equal(core.recordRangeBreak(tracker, "vergence_up", -3), false);
  assert.equal(core.hasPendingRangeBreak(tracker, "vergence_up"), false);
});

test("csv fields are quoted and formula-guarded without mangling numbers", () => {
  assert.equal(core.csvEscapeField("convergence"), "convergence");
  assert.equal(core.csvEscapeField(""), "");
  assert.equal(core.csvEscapeField(null), "");
  assert.equal(core.csvEscapeField(undefined), "");
  assert.equal(core.csvEscapeField(-3), "-3");
  assert.equal(core.csvEscapeField(12.5), "12.5");
  assert.equal(core.csvEscapeField("a,b"), '"a,b"');
  assert.equal(core.csvEscapeField('a"b'), '"a""b"');
  assert.equal(core.csvEscapeField("line1\nline2"), '"line1\nline2"');
  assert.equal(core.csvEscapeField("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(core.csvEscapeField("+cmd"), "'+cmd");
  assert.equal(core.csvEscapeField("@formula"), "'@formula");
  assert.equal(core.csvEscapeField("=1+2,3"), '"\'=1+2,3"');
  assert.equal(core.csvEscapeField(true), "true");
  assert.equal(core.csvEscapeField({ toString: 1 }), "");
  assert.equal(core.csvEscapeField(["=1"]), "");
});

test("clamp helpers fall back on any non-finite input", () => {
  assert.equal(core.clampInt(5, 0, 10, 99), 5);
  assert.equal(core.clampInt(2.5, 0, 10, 99), 2);
  assert.equal(core.clampInt(Number.NaN, 0, 10, 99), 99);
  assert.equal(core.clampInt(undefined, 0, 10, 99), 99);
  assert.equal(core.clampInt(Infinity, 0, 10, 99), 99);
  assert.equal(core.clampInt(-Infinity, 0, 10, 99), 99);

  assert.equal(core.clampFloat(2.5, 0, 10, 99), 2.5);
  assert.equal(core.clampFloat(Number.NaN, 0, 10, 99), 99);
  assert.equal(core.clampFloat(undefined, 0, 10, 99), 99);
  assert.equal(core.clampFloat(Infinity, 0, 10, 99), 99);
});

test("difficulty steps clamp to the allowed range", () => {
  assert.equal(core.clampDifficultySteps(-2, 50), 0);
  assert.equal(core.clampDifficultySteps(12.5, 50), 12.5);
  assert.equal(core.clampDifficultySteps(80, 50), 50);
});

test("divergence ceiling follows viewing distance and matches the near norm", () => {
  const atSixteenInches = core.getDivergenceCeilingPd(16, 6.2, 6);
  assert(Math.abs(atSixteenInches - 21.25) < 0.1, `expected about 21.25, got ${atSixteenInches}`);

  const atSixtyInches = core.getDivergenceCeilingPd(60, 6.2, 6);
  assert(atSixtyInches > 9.9 && atSixtyInches < 10.2, `expected about 10.1, got ${atSixtyInches}`);

  assert.equal(core.getDivergenceCeilingPd(0, 6.2, 6), 6);
  assert.equal(core.getDivergenceCeilingPd(Number.NaN, 6.2, 6), 6);
});

test("canvas metrics follow rendered display size", () => {
  const canvas = {
    clientWidth: 960,
    clientHeight: 720,
    getBoundingClientRect() {
      return { width: 960, height: 720 };
    }
  };

  const metrics = core.getCanvasMetrics(canvas, 2, 680, 680);
  assert.deepEqual(metrics, {
    cssWidth: 960,
    cssHeight: 720,
    dpr: 2,
    backingWidth: 1920,
    backingHeight: 1440
  });
  assert.equal(core.getFieldExtent(metrics.cssWidth, metrics.cssHeight, 0.34), 244.8);
});

test("display context normalization and comparison are stable", () => {
  const previous = core.normalizeDisplayContext(1727.6, 1117.3, 2.0004);
  const current = core.normalizeDisplayContext(1728, 1117, 2);
  const changed = core.normalizeDisplayContext(1512, 982, 2);

  assert.deepEqual(previous, {
    screenWidth: 1728,
    screenHeight: 1117,
    devicePixelRatio: 2
  });
  assert.equal(core.isSameDisplayContext(previous, current), true);
  assert.equal(core.isSameDisplayContext(previous, changed), false);
  assert.equal(core.isSameDisplayContext(previous, null), false);
});
