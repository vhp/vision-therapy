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

test("vergence scheduling behaves as expected", () => {
  assert.equal(core.resolveRoundVergence("alternate", 1, 0), "convergence");
  assert.equal(core.resolveRoundVergence("alternate", 2, 0), "divergence");
  assert.equal(core.resolveRoundVergence("divergence", 3, 0), "divergence");
  assert.equal(core.resolveRoundVergence("vergence_up", 4, 0), "vergence_up");

  const sequenceA = Array.from({ length: 8 }, (_, index) => core.resolveRoundVergence("random_jump", index + 1, 12345));
  const sequenceB = Array.from({ length: 8 }, (_, index) => core.resolveRoundVergence("random_jump", index + 1, 12345));
  assert.deepEqual(sequenceA, sequenceB);
  assert(sequenceA.every(mode => mode === "convergence" || mode === "divergence"));
});

test("vergence vectors respect axis and vertical polarity", () => {
  assert.deepEqual(core.getVergenceVector("convergence", "standard"), { x: 1, y: 0 });
  assert.deepEqual(core.getVergenceVector("divergence", "standard"), { x: -1, y: 0 });
  assert.deepEqual(core.getVergenceVector("vergence_up", "standard"), { x: 0, y: 1 });
  assert.deepEqual(core.getVergenceVector("vergence_down", "standard"), { x: 0, y: -1 });
  assert.deepEqual(core.getVergenceVector("vergence_up", "flipped"), { x: 0, y: -1 });
  assert.deepEqual(core.getVergenceVector("vergence_down", "flipped"), { x: 0, y: 1 });
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
    splitGainPxPerStep
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
