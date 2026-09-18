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
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }

  function clampFloat(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function createRng(seed) {
    let state = seed >>> 0;
    return () => {
      // A linear congruential generator with the classic Numerical Recipes
      // multiplier and increment: a fast, seedable, repeatable pseudo-random stream.
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296; // divide by 2^32 to map the 32-bit state into the range [0, 1)
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
    // 0x9e3779b1 is the golden-ratio hash constant; multiplying by it scrambles
    // the round number and session seed together so each round's direction looks
    // random yet replays the same way from the same seed.
    const mixedSeed = (Math.imul(safeRound, 0x9e3779b1) ^ ((sequenceSeed || 0) >>> 0)) >>> 0;
    return createRng(mixedSeed)() < 0.5 ? "convergence" : "divergence";
  }

  function resolveRoundVergence(vergenceMode, round, sequenceSeed) {
    const normalized = typeof vergenceMode === "string" ? vergenceMode.trim().toLowerCase() : "";
    if (normalized === "alternate" || normalized === "facility") {
      return round % 2 === 0 ? "divergence" : "convergence";
    }
    if (normalized === "smooth") {
      return "convergence";
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

  // Which eye sits behind the red lens decides the sign of horizontal
  // disparity: red-drawn dots are seen by that eye, so swapping the lens side
  // swaps crossed and uncrossed disparity. Red-right matches the historical
  // rendering; red-left (the common retail convention) flips it. Vertical
  // modes are unaffected because their polarity setting is defined relative
  // to the red image, not an eye.
  function getRedLensHorizontalSign(redLensSide) {
    return redLensSide === "left" ? -1 : 1;
  }

  function getVergenceVector(roundVergence, verticalPolarity, redLensSide) {
    const normalized = typeof roundVergence === "string" ? roundVergence.trim().toLowerCase() : "";
    const horizontalSign = getRedLensHorizontalSign(redLensSide);
    if (normalized === "divergence") {
      return { x: -horizontalSign, y: 0 };
    }
    if (normalized === "vergence_up") {
      return { x: 0, y: getVerticalPolaritySign(verticalPolarity) };
    }
    if (normalized === "vergence_down") {
      return { x: 0, y: -getVerticalPolaritySign(verticalPolarity) };
    }
    return { x: horizontalSign, y: 0 };
  }

  function getTotalSplitPx(difficultySteps, baseTotalSplitPx, splitGainPxPerStep) {
    const safeSteps = Math.max(0, difficultySteps);
    return baseTotalSplitPx + safeSteps * splitGainPxPerStep;
  }

  // The most base-in (divergence) demand a person can meet: relaxing the eyes
  // to parallel cancels the baseline convergence to the screen (eye separation
  // over viewing distance), and true divergence beyond parallel adds only a
  // few diopters more. At a typical 40cm read distance this lands on the
  // published near base-in break norm of about 21.
  function getDivergenceCeilingPd(viewDistanceIn, ipdCm, marginPd) {
    const distanceM = viewDistanceIn * 0.0254; // 0.0254 converts inches to meters
    if (!Number.isFinite(distanceM) || distanceM <= 0) return marginPd;
    return ipdCm / distanceM + marginPd;
  }

  function getMmPerPixel(monitorWidthIn, screenWidthPx) {
    if (!Number.isFinite(monitorWidthIn) || monitorWidthIn <= 0) return 0;
    if (!Number.isFinite(screenWidthPx) || screenWidthPx <= 0) return 0;
    return (monitorWidthIn * 25.4) / screenWidthPx; // 25.4 converts inches to millimeters, giving millimeters of real screen per horizontal pixel
  }

  function splitPxToPd(splitPx, monitorWidthIn, viewDistanceIn, screenWidthPx) {
    const mmPerPx = getMmPerPixel(monitorWidthIn, screenWidthPx);
    const distanceM = viewDistanceIn * 0.0254; // 0.0254 converts inches to meters
    if (mmPerPx <= 0 || distanceM <= 0) return 0;

    const displacementCm = (splitPx * mmPerPx) / 10; // pixels times mm-per-pixel gives millimeters; divide by 10 to get centimeters
    return displacementCm / distanceM;
  }

  function pdToSplitPx(pd, monitorWidthIn, viewDistanceIn, screenWidthPx) {
    const mmPerPx = getMmPerPixel(monitorWidthIn, screenWidthPx);
    const distanceM = viewDistanceIn * 0.0254; // 0.0254 converts inches to meters
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
    // Absolute like a prism bar: a nonzero base split is real starting demand, so it counts.
    const totalSplitPx = getTotalSplitPx(difficultySteps, baseTotalSplitPx, splitGainPxPerStep);
    return splitPxToPd(totalSplitPx, monitorWidthIn, viewDistanceIn, screenWidthPx);
  }

  function pdToDifficultySteps(
    targetPd,
    monitorWidthIn,
    viewDistanceIn,
    screenWidthPx,
    splitGainPxPerStep,
    baseTotalSplitPx = 0
  ) {
    const splitPx = pdToSplitPx(targetPd, monitorWidthIn, viewDistanceIn, screenWidthPx);
    return Math.max(0, (splitPx - baseTotalSplitPx) / splitGainPxPerStep);
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

  // Escapes one CSV field: quotes when it holds a comma/quote/newline, and
  // guards against spreadsheet formula injection by prefixing a quote to
  // strings that begin with =, +, -, @ (skipping plain numbers so real
  // negatives survive).
  function csvEscapeField(value) {
    let text = value === null || value === undefined ? "" : String(value);
    const isPlainNumber = /^-?\d+(?:\.\d+)?$/.test(text);
    if (!isPlainNumber && /^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }
    if (/[",\n\r]/.test(text)) {
      text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  // Break/recovery tracking mirrors clinical fusional range measurement: a
  // break is the demand where fusion is reported lost, the recovery is the
  // demand where the next correct response lands for the same exercise.
  function recordRangeBreak(rangeTracker, exerciseKey, breakPd) {
    // A break at or below zero demand is not a fusional-range measurement: the
    // demand floor is zero, so no lower recovery could ever answer it and the
    // break would stay pending forever. Reject it so it stays a plain skip.
    if (!Number.isFinite(breakPd) || breakPd <= 0) return false;
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
    // Recovery is always at a lower demand than the break it answers. If it is
    // not below (for example the smooth ramp climbed back up before the user
    // re-fused), the pair is not physiologic, so keep the break pending and
    // wait for a genuine lower recovery rather than storing an inverted pair.
    if (recoveryPd >= entry.pendingBreakPd) return null;
    const pair = { breakPd: entry.pendingBreakPd, recoveryPd };
    entry.pairs.push(pair);
    entry.pendingBreakPd = null;
    return pair;
  }

  function hasPendingRangeBreak(rangeTracker, exerciseKey) {
    const entry = rangeTracker[normalizeExerciseKey(exerciseKey) || "unassigned"];
    return Boolean(entry) && entry.pendingBreakPd !== null;
  }

  function getBestRangePair(rangeTracker, exerciseKey) {
    const entry = rangeTracker[normalizeExerciseKey(exerciseKey) || "unassigned"];
    if (!entry || entry.pairs.length === 0) return null;
    return entry.pairs.reduce((best, pair) => (pair.breakPd > best.breakPd ? pair : best));
  }

  // N-down/1-up transformed staircase. Equal steps and N=3 target ~79%; the
  // shipped asymmetric steps (0.75 up / 1 down, set in the caller) settle
  // accuracy near 83%. This function only tracks the N-in-a-row rule.
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
    // 680 matches the canvas's declared width in index.html; it is used only if
    // the element cannot report a real size yet (for example before first layout).
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
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.34; // 0.34 is the large field-size ratio, used if a caller passes no ratio
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
    createRng,
    getDebugDifficultyDirection,
    resolveRandomJumpVergence,
    resolveRoundVergence,
    getVergenceAxis,
    getVerticalPolaritySign,
    getVergenceVector,
    getTotalSplitPx,
    getDivergenceCeilingPd,
    normalizeExerciseKey,
    createEmptyExerciseMetrics,
    recordScoringEvent,
    getExerciseScore,
    clampDifficultySteps,
    csvEscapeField,
    advanceStaircase,
    recordRangeBreak,
    recordRangeRecovery,
    hasPendingRangeBreak,
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
