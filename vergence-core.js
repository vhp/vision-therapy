(function attachVergenceCore(globalScope, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.VergenceCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createVergenceCore() {
  function clampInt(value, min, max, fallback) {
    if (Number.isNaN(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function clampFloat(value, min, max, fallback) {
    if (Number.isNaN(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function sanitizePresetFloat(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function sanitizePresetInt(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }

  function createRng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function getDebugDifficultyDirection(event) {
    if (event?.ctrlKey || event?.metaKey || event?.altKey) return 0;
    const key = typeof event?.key === "string" ? event.key : "";
    const code = typeof event?.code === "string" ? event.code : "";
    if (code === "NumpadAdd") return 1;
    if (code === "NumpadSubtract") return -1;
    if (code === "BracketRight" || key === "]") return 1;
    if (code === "BracketLeft" || key === "[") return -1;
    if (code === "Equal" || key === "+" || key === "=") return 1;
    if (code === "Minus" || key === "-") return -1;
    return 0;
  }

  function resolveRandomJumpVergence(round, sequenceSeed) {
    const safeRound = Math.max(1, Math.trunc(round) || 1);
    const mixedSeed = (Math.imul(safeRound, 0x9e3779b1) ^ ((sequenceSeed || 0) >>> 0)) >>> 0;
    return createRng(mixedSeed)() < 0.5 ? "convergence" : "divergence";
  }

  function resolveRoundVergence(vergenceMode, round, sequenceSeed) {
    const normalized = typeof vergenceMode === "string" ? vergenceMode.trim().toLowerCase() : "";
    if (normalized === "alternate") {
      return round % 2 === 0 ? "divergence" : "convergence";
    }
    if (normalized === "random_jump") {
      return resolveRandomJumpVergence(round, sequenceSeed);
    }
    if (normalized === "vergence_up" || normalized === "vergence_down") {
      return normalized;
    }
    return normalized === "divergence" ? "divergence" : "convergence";
  }

  function getVergenceAxis(roundVergence) {
    const normalized = typeof roundVergence === "string" ? roundVergence.trim().toLowerCase() : "";
    return normalized === "vergence_up" || normalized === "vergence_down" ? "vertical" : "horizontal";
  }

  function getVerticalPolaritySign(verticalPolarity) {
    return verticalPolarity === "flipped" ? -1 : 1;
  }

  function getVergenceVector(roundVergence, verticalPolarity) {
    const normalized = typeof roundVergence === "string" ? roundVergence.trim().toLowerCase() : "";
    if (normalized === "divergence") {
      return { x: -1, y: 0 };
    }
    if (normalized === "vergence_up") {
      return { x: 0, y: getVerticalPolaritySign(verticalPolarity) };
    }
    if (normalized === "vergence_down") {
      return { x: 0, y: -getVerticalPolaritySign(verticalPolarity) };
    }
    return { x: 1, y: 0 };
  }

  function getTotalSplitPx(difficultySteps, baseTotalSplitPx, splitGainPxPerStep) {
    const safeSteps = Math.max(0, difficultySteps);
    return baseTotalSplitPx + safeSteps * splitGainPxPerStep;
  }

  function getMmPerPixel(monitorWidthIn, screenWidthPx) {
    if (!Number.isFinite(monitorWidthIn) || monitorWidthIn <= 0) return 0;
    if (!Number.isFinite(screenWidthPx) || screenWidthPx <= 0) return 0;
    return (monitorWidthIn * 25.4) / screenWidthPx;
  }

  function splitPxToPd(splitPx, monitorWidthIn, viewDistanceIn, screenWidthPx) {
    const mmPerPx = getMmPerPixel(monitorWidthIn, screenWidthPx);
    const distanceM = viewDistanceIn * 0.0254;
    if (mmPerPx <= 0 || distanceM <= 0) return 0;

    const displacementCm = (splitPx * mmPerPx) / 10;
    return displacementCm / distanceM;
  }

  function pdToSplitPx(pd, monitorWidthIn, viewDistanceIn, screenWidthPx) {
    const mmPerPx = getMmPerPixel(monitorWidthIn, screenWidthPx);
    const distanceM = viewDistanceIn * 0.0254;
    if (mmPerPx <= 0 || distanceM <= 0) return 0;

    const displacementCm = pd * distanceM;
    const displacementMm = displacementCm * 10;
    return displacementMm / mmPerPx;
  }

  function difficultyToPd(
    difficultySteps,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    baseTotalSplitPx,
    splitGainPxPerStep
  ) {
    const totalSplitPx = getTotalSplitPx(difficultySteps, baseTotalSplitPx, splitGainPxPerStep);
    const relativeSplitPx = Math.max(0, totalSplitPx - baseTotalSplitPx);
    return splitPxToPd(relativeSplitPx, monitorWidthIn, viewDistanceIn, screenWidthPx);
  }

  function pdToDifficultySteps(
    targetPd,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    splitGainPxPerStep
  ) {
    const relativeSplitPx = Math.max(0, pdToSplitPx(targetPd, monitorWidthIn, viewDistanceIn, screenWidthPx));
    return relativeSplitPx / splitGainPxPerStep;
  }

  function normalizeExerciseKey(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
  }

  function createEmptyExerciseMetrics() {
    return { score: 0, correct: 0, wrong: 0, skip: 0, timeout: 0, suppression: 0 };
  }

  function recordScoringEvent(metricsByExercise, outcomeType, exerciseKey) {
    const normalized = normalizeExerciseKey(exerciseKey) || "unassigned";
    if (!metricsByExercise[normalized]) {
      metricsByExercise[normalized] = createEmptyExerciseMetrics();
    }
    const metrics = metricsByExercise[normalized];

    let scoreDelta = 0;
    if (outcomeType === "correct") {
      scoreDelta = 1;
      metrics.correct += 1;
    } else if (outcomeType === "wrong") {
      scoreDelta = -1;
      metrics.wrong += 1;
    } else if (outcomeType === "skip") {
      scoreDelta = -1;
      metrics.skip += 1;
    } else if (outcomeType === "timeout") {
      scoreDelta = -1;
      metrics.timeout += 1;
    } else if (outcomeType === "suppression") {
      // A suppression report is a fusion-quality signal, not a task answer,
      // so it counts as an event but never moves the score.
      metrics.suppression += 1;
    }

    metrics.score += scoreDelta;
    return { exerciseKey: normalized, scoreDelta, exerciseScore: metrics.score };
  }

  function getExerciseScore(metricsByExercise, exerciseKey) {
    const normalized = normalizeExerciseKey(exerciseKey);
    if (!normalized) return 0;
    return metricsByExercise[normalized]?.score || 0;
  }

  function clampDifficultySteps(steps, maxSteps) {
    return Math.min(maxSteps, Math.max(0, steps));
  }

  // Break/recovery tracking mirrors clinical fusional range measurement: a
  // break is the demand where fusion is reported lost, the recovery is the
  // demand where the next correct response lands for the same exercise.
  function recordRangeBreak(rangeTracker, exerciseKey, breakPd) {
    if (!Number.isFinite(breakPd)) return false;
    const key = normalizeExerciseKey(exerciseKey) || "unassigned";
    if (!rangeTracker[key]) {
      rangeTracker[key] = { pendingBreakPd: null, pairs: [] };
    }
    if (rangeTracker[key].pendingBreakPd !== null) return false;
    rangeTracker[key].pendingBreakPd = breakPd;
    return true;
  }

  function recordRangeRecovery(rangeTracker, exerciseKey, recoveryPd) {
    if (!Number.isFinite(recoveryPd)) return null;
    const key = normalizeExerciseKey(exerciseKey) || "unassigned";
    const entry = rangeTracker[key];
    if (!entry || entry.pendingBreakPd === null) return null;
    const pair = { breakPd: entry.pendingBreakPd, recoveryPd };
    entry.pairs.push(pair);
    entry.pendingBreakPd = null;
    return pair;
  }

  function getBestRangePair(rangeTracker, exerciseKey) {
    const entry = rangeTracker[normalizeExerciseKey(exerciseKey) || "unassigned"];
    if (!entry || entry.pairs.length === 0) return null;
    return entry.pairs.reduce((best, pair) => (pair.breakPd > best.breakPd ? pair : best));
  }

  // N-down/1-up transformed staircase; with N=3 accuracy converges near 79%.
  function advanceStaircase(consecutiveCorrect, outcomeType, correctPerStepUp) {
    const required = Math.max(1, Math.trunc(correctPerStepUp) || 1);
    if (outcomeType === "correct") {
      const streak = (Number.isFinite(consecutiveCorrect) ? Math.max(0, consecutiveCorrect) : 0) + 1;
      if (streak >= required) {
        return { consecutiveCorrect: 0, direction: 1 };
      }
      return { consecutiveCorrect: streak, direction: 0 };
    }
    return { consecutiveCorrect: 0, direction: -1 };
  }

  function pdDeltaToDifficultySteps(
    pdDelta,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    splitGainPxPerStep
  ) {
    if (!Number.isFinite(pdDelta) || pdDelta === 0) return 0;
    const magnitude = pdToDifficultySteps(
      Math.abs(pdDelta),
      monitorWidthIn,
      viewDistanceIn,
      screenWidthPx,
      splitGainPxPerStep
    );
    return Math.sign(pdDelta) * magnitude;
  }

  function getCanvasViewportSize(canvas, fallbackWidth, fallbackHeight) {
    const safeFallbackWidth = Number.isFinite(fallbackWidth) && fallbackWidth > 0 ? fallbackWidth : 680;
    const safeFallbackHeight = Number.isFinite(fallbackHeight) && fallbackHeight > 0 ? fallbackHeight : safeFallbackWidth;
    const rect = canvas?.getBoundingClientRect?.();
    const rectWidth = rect && Number.isFinite(rect.width) ? rect.width : 0;
    const rectHeight = rect && Number.isFinite(rect.height) ? rect.height : 0;
    const clientWidth = Number.isFinite(canvas?.clientWidth) ? canvas.clientWidth : 0;
    const clientHeight = Number.isFinite(canvas?.clientHeight) ? canvas.clientHeight : 0;
    const width = rectWidth > 0 ? rectWidth : clientWidth > 0 ? clientWidth : safeFallbackWidth;
    const height = rectHeight > 0 ? rectHeight : clientHeight > 0 ? clientHeight : safeFallbackHeight;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  function getCanvasMetrics(canvas, devicePixelRatio, fallbackWidth, fallbackHeight) {
    const viewport = getCanvasViewportSize(canvas, fallbackWidth, fallbackHeight);
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return {
      cssWidth: viewport.width,
      cssHeight: viewport.height,
      dpr,
      backingWidth: Math.max(1, Math.round(viewport.width * dpr)),
      backingHeight: Math.max(1, Math.round(viewport.height * dpr))
    };
  }

  function getFieldExtent(width, height, ratio) {
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.34;
    return Math.min(width, height) * safeRatio;
  }

  function normalizeDisplayContext(screenWidth, screenHeight, devicePixelRatio) {
    const safeScreenWidth = Number.isFinite(screenWidth) && screenWidth > 0 ? Math.round(screenWidth) : 0;
    const safeScreenHeight = Number.isFinite(screenHeight) && screenHeight > 0 ? Math.round(screenHeight) : 0;
    const safeDevicePixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.round(devicePixelRatio * 1000) / 1000
      : 1;

    return {
      screenWidth: safeScreenWidth,
      screenHeight: safeScreenHeight,
      devicePixelRatio: safeDevicePixelRatio
    };
  }

  function isSameDisplayContext(previousContext, currentContext) {
    if (!previousContext || typeof previousContext !== "object") return false;
    if (!currentContext || typeof currentContext !== "object") return false;

    const previous = normalizeDisplayContext(
      previousContext.screenWidth,
      previousContext.screenHeight,
      previousContext.devicePixelRatio
    );
    const current = normalizeDisplayContext(
      currentContext.screenWidth,
      currentContext.screenHeight,
      currentContext.devicePixelRatio
    );

    return previous.screenWidth === current.screenWidth &&
      previous.screenHeight === current.screenHeight &&
      previous.devicePixelRatio === current.devicePixelRatio;
  }

  return Object.freeze({
    clampInt,
    clampFloat,
    sanitizePresetFloat,
    sanitizePresetInt,
    createRng,
    getDebugDifficultyDirection,
    resolveRandomJumpVergence,
    resolveRoundVergence,
    getVergenceAxis,
    getVerticalPolaritySign,
    getVergenceVector,
    getTotalSplitPx,
    normalizeExerciseKey,
    createEmptyExerciseMetrics,
    recordScoringEvent,
    getExerciseScore,
    clampDifficultySteps,
    advanceStaircase,
    recordRangeBreak,
    recordRangeRecovery,
    getBestRangePair,
    getMmPerPixel,
    splitPxToPd,
    pdToSplitPx,
    difficultyToPd,
    pdToDifficultySteps,
    pdDeltaToDifficultySteps,
    getCanvasViewportSize,
    getCanvasMetrics,
    getFieldExtent,
    normalizeDisplayContext,
    isSameDisplayContext
  });
});
