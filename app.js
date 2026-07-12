/*
  Vergence Trainer.
  App flow: input config -> session state -> HUD/canvas render.
  Runtime settings are loaded from window.APP_CONFIG (config.js).
*/

if (!window.APP_CONFIG) {
  throw new Error("APP_CONFIG missing. Load config.js before app.js.");
}
if (!window.VergenceCore) {
  throw new Error("VergenceCore missing. Load vergence-core.js before app.js.");
}

const {
  clampInt: coreClampInt,
  clampFloat: coreClampFloat,
  sanitizePresetFloat: coreSanitizePresetFloat,
  sanitizePresetInt: coreSanitizePresetInt,
  createRng: coreCreateRng,
  getDebugDifficultyDirection: coreGetDebugDifficultyDirection,
  resolveRoundVergence: coreResolveRoundVergence,
  getVergenceAxis: coreGetVergenceAxis,
  getVerticalPolaritySign: coreGetVerticalPolaritySign,
  getVergenceVector: coreGetVergenceVector,
  getTotalSplitPx: coreGetTotalSplitPx,
  normalizeExerciseKey: coreNormalizeExerciseKey,
  recordScoringEvent: coreRecordScoringEvent,
  getExerciseScore: coreGetExerciseScore,
  clampDifficultySteps: coreClampDifficultySteps,
  advanceStaircase: coreAdvanceStaircase,
  recordRangeBreak: coreRecordRangeBreak,
  recordRangeRecovery: coreRecordRangeRecovery,
  getBestRangePair: coreGetBestRangePair,
  getMmPerPixel: coreGetMmPerPixel,
  splitPxToPd: coreSplitPxToPd,
  pdToSplitPx: corePdToSplitPx,
  difficultyToPd: coreDifficultyToPd,
  pdToDifficultySteps: corePdToDifficultySteps,
  pdDeltaToDifficultySteps: corePdDeltaToDifficultySteps,
  getCanvasMetrics: coreGetCanvasMetrics,
  getFieldExtent: coreGetFieldExtent,
  normalizeDisplayContext: coreNormalizeDisplayContext,
  isSameDisplayContext: coreIsSameDisplayContext
} = window.VergenceCore;

const {
  DEFAULT_ROUND_SECONDS,
  MIN_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
  TICK_MS,
  PD_GAIN_PER_CORRECT,
  PD_LOSS_PER_ERROR = 1,
  STAIRCASE_CORRECT_PER_STEP_UP = 3,
  FACILITY_BASE_IN_PD = 3,
  FACILITY_BASE_OUT_PD = 12,
  INACTIVITY_PAUSE_MS,
  NEXT_ROUND_DELAY_MS,
  CONFIG_STORAGE_KEY,
  HISTORY_STORAGE_KEY = "vergence_trainer.history.v1",
  HISTORY_MAX_ENTRIES = 200,
  DEFAULT_MONITOR_WIDTH_IN,
  DEFAULT_VIEW_DISTANCE_IN,
  DEFAULT_START_PD,
  DEFAULT_GOAL_PD,
  DEFAULT_SESSION_MINUTES,
  DEFAULT_FIELD_SHAPE = "circle",
  DEFAULT_VISUAL_PRESET,
  ABSOLUTE_PD_MAX,
  ABSOLUTE_SESSION_MINUTES_MAX,
  MIN_MONITOR_WIDTH_IN,
  MAX_MONITOR_WIDTH_IN,
  MIN_VIEW_DISTANCE_IN,
  MAX_VIEW_DISTANCE_IN,
  BASE_TOTAL_SPLIT_PX,
  SPLIT_GAIN_PX_PER_STEP,
  BACKGROUND_SPLIT_RATIO,
  SQUARE_SPLIT_RATIO,
  TARGET_OFFSET_RATIO = 0.52,
  TARGET_HALF_SIZE_RATIO = 0.2,
  TARGET_EDGE_PADDING_PX = 2,
  TARGET_POP_SIZE_PX = 0,
  TARGET_POP_ALPHA_SCALE = 1.0,
  INITIAL_DOT_COUNT,
  ROUND_DOT_COUNT,
  DOT_MEDIUM_THRESHOLD = 0.68,
  DOT_LARGE_THRESHOLD = 0.96,
  DOT_SMALL_SIZE_PX = 1,
  DOT_MEDIUM_SIZE_PX = 2,
  DOT_LARGE_SIZE_PX = 3,
  LEFT_DOT_COLOR,
  RIGHT_DOT_COLOR,
  VERGENCE_MODES: CONFIGURED_VERGENCE_MODES,
  VISUAL_PRESETS: CONFIGURED_VISUAL_PRESETS
} = window.APP_CONFIG;

const FALLBACK_VERGENCE_MODES = Object.freeze([
  { value: "convergence", label: "Convergence" },
  { value: "divergence", label: "Divergence" },
  { value: "alternate", label: "Jump Vergence (Alternating)" },
  { value: "random_jump", label: "Jump Vergence (Random)" },
  { value: "facility", label: "Vergence Facility (3Δ / 12Δ)" },
  { value: "vergence_up", label: "Vergence Up" },
  { value: "vergence_down", label: "Vergence Down" }
]);

const VERGENCE_MODES = Object.freeze(
  (Array.isArray(CONFIGURED_VERGENCE_MODES) ? CONFIGURED_VERGENCE_MODES : FALLBACK_VERGENCE_MODES)
    .map(mode => {
      const value = typeof mode?.value === "string" ? mode.value : "";
      const label = typeof mode?.label === "string" && mode.label.trim() ? mode.label : value;
      return { value, label };
    })
    .filter(mode => mode.value.length > 0)
);

if (VERGENCE_MODES.length === 0) {
  throw new Error("APP_CONFIG.VERGENCE_MODES must include at least one mode.");
}

const VERGENCE_MODE_MAP = new Map(VERGENCE_MODES.map(mode => [mode.value, mode]));
const DEFAULT_VERGENCE_MODE = VERGENCE_MODE_MAP.has("convergence")
  ? "convergence"
  : VERGENCE_MODES[0].value;

const FALLBACK_VISUAL_PRESET_TUNING = Object.freeze({
  backgroundSplitRatio: BACKGROUND_SPLIT_RATIO,
  squareSplitRatio: SQUARE_SPLIT_RATIO,
  targetPopSizePx: TARGET_POP_SIZE_PX,
  targetPopAlphaScale: TARGET_POP_ALPHA_SCALE,
  dotMediumThreshold: DOT_MEDIUM_THRESHOLD,
  dotLargeThreshold: DOT_LARGE_THRESHOLD,
  dotSmallSizePx: DOT_SMALL_SIZE_PX,
  dotMediumSizePx: DOT_MEDIUM_SIZE_PX,
  dotLargeSizePx: DOT_LARGE_SIZE_PX
});
const FALLBACK_VISUAL_PRESETS = Object.freeze([
  {
    value: "balanced",
    label: "Balanced",
    tuning: FALLBACK_VISUAL_PRESET_TUNING
  }
]);
const VISUAL_PRESETS = Object.freeze(
  (Array.isArray(CONFIGURED_VISUAL_PRESETS) ? CONFIGURED_VISUAL_PRESETS : FALLBACK_VISUAL_PRESETS)
    .map(normalizeVisualPresetConfig)
    .filter(Boolean)
);

if (VISUAL_PRESETS.length === 0) {
  throw new Error("APP_CONFIG.VISUAL_PRESETS must include at least one preset.");
}

const VISUAL_PRESET_MAP = new Map(VISUAL_PRESETS.map(preset => [preset.value, preset]));
const DEFAULT_VISUAL_PRESET_VALUE = VISUAL_PRESET_MAP.has(DEFAULT_VISUAL_PRESET)
  ? DEFAULT_VISUAL_PRESET
  : VISUAL_PRESETS[0].value;
const DEFAULT_VISUAL_TUNING = getVisualPresetTuning(DEFAULT_VISUAL_PRESET_VALUE);
const DEFAULT_FIELD_SHAPE_VALUE = DEFAULT_FIELD_SHAPE === "square" ? "square" : "circle";
const FIELD_SHAPE_VALUES = Object.freeze(["circle", "square"]);
const FIELD_SIZE_RATIOS = Object.freeze({ large: 0.34, medium: 0.27, small: 0.2 });
const FIELD_SIZE_VALUES = Object.freeze(Object.keys(FIELD_SIZE_RATIOS));
const DEFAULT_FIELD_SIZE_VALUE = "large";
const DEFAULT_VERTICAL_POLARITY = "standard";
const VERTICAL_POLARITY_VALUES = Object.freeze(["standard", "flipped"]);

const SIDE_KEYS = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left"
};
const SIDES = ["up", "right", "down", "left"];
const EXERCISE_LABEL = "Vergence Trainer";

function parseRgbColor(colorText, fallback) {
  const match = typeof colorText === "string"
    ? colorText.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/)
    : null;
  if (!match) return fallback;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] !== undefined ? Number(match[4]) : 1
  };
}

const LEFT_DOT_RGB = parseRgbColor(LEFT_DOT_COLOR, { r: 255, g: 70, b: 70, a: 0.9 });
const RIGHT_DOT_RGB = parseRgbColor(RIGHT_DOT_COLOR, { r: 58, g: 197, b: 255, a: 0.9 });
const MIN_DOT_INTENSITY = 0.3;
const MAX_DOT_INTENSITY = 1;
const DEFAULT_LEFT_DOT_INTENSITY = Math.min(MAX_DOT_INTENSITY, Math.max(MIN_DOT_INTENSITY, LEFT_DOT_RGB.a));
const DEFAULT_RIGHT_DOT_INTENSITY = Math.min(MAX_DOT_INTENSITY, Math.max(MIN_DOT_INTENSITY, RIGHT_DOT_RGB.a));
const URL_FLAGS = readUrlFlags();
const DEBUG_MODE = URL_FLAGS.debug;
const CLEAR_SAVED_CONFIG_ON_LOAD = URL_FLAGS.clearSettings;

const scoreEl = document.getElementById("score");
const prismEl = document.getElementById("prism");
const goalPdHudEl = document.getElementById("goalPdHud");
const roundEl = document.getElementById("round");
const timerEl = document.getElementById("timer");
const sessionTimerEl = document.getElementById("sessionTimer");
const statusEl = document.getElementById("status");
const pauseCardEl = document.getElementById("pauseCard");
const pauseExerciseNameEl = document.getElementById("pauseExerciseName");
const pauseVergenceModeEl = document.getElementById("pauseVergenceMode");
const pauseLrSplitEl = document.getElementById("pauseLrSplit");
const debugStatusEl = document.getElementById("debugStatus");
const debugControlsEl = document.getElementById("debugControls");
const debugDownBtn = document.getElementById("debugDownBtn");
const debugUpBtn = document.getElementById("debugUpBtn");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const advancedSetupEl = document.querySelector(".advanced-setup");

const monitorWidthInput = document.getElementById("monitorWidth");
const monitorWidthConfirmBtn = document.getElementById("monitorWidthConfirmBtn");
const viewDistanceInput = document.getElementById("viewDistance");
const vergenceModeInput = document.getElementById("vergenceMode");
const visualPresetInput = document.getElementById("visualPreset");
const startPdInput = document.getElementById("startPd");
const goalPdInput = document.getElementById("goalPd");
const sessionMinutesInput = document.getElementById("sessionMinutes");
const roundSecondsInput = document.getElementById("roundSeconds");
const fieldShapeInput = document.getElementById("fieldShape");
const fieldSizeInput = document.getElementById("fieldSize");
const verticalPolarityInput = document.getElementById("verticalPolarity");
const leftDotIntensityInput = document.getElementById("leftDotIntensity");
const leftDotIntensityValueEl = document.getElementById("leftDotIntensityValue");
const rightDotIntensityInput = document.getElementById("rightDotIntensity");
const rightDotIntensityValueEl = document.getElementById("rightDotIntensityValue");
const lrSplitInput = document.getElementById("lrSplit");

const summaryCardEl = document.getElementById("summaryCard");
const sumResultEl = document.getElementById("sumResult");
const sumBestPdEl = document.getElementById("sumBestPd");
const sumGoalPdEl = document.getElementById("sumGoalPd");
const sumScoreEl = document.getElementById("sumScore");
const sumExerciseScoresEl = document.getElementById("sumExerciseScores");
const sumRangesEl = document.getElementById("sumRanges");
const sumFacilityEl = document.getElementById("sumFacility");
const sumRoundsEl = document.getElementById("sumRounds");
const sumDurationEl = document.getElementById("sumDuration");
const sumCorrectEl = document.getElementById("sumCorrect");
const sumWrongEl = document.getElementById("sumWrong");
const sumTimeoutsEl = document.getElementById("sumTimeouts");
const sumSkipsEl = document.getElementById("sumSkips");
const sumSuppressionsEl = document.getElementById("sumSuppressions");

const historyCardEl = document.getElementById("historyCard");
const historyEmptyEl = document.getElementById("historyEmpty");
const historyTableEl = document.getElementById("historyTable");
const historyTableBodyEl = document.getElementById("historyTableBody");
const historyTrendWrapEl = document.getElementById("historyTrendWrap");
const historyTrendEl = document.getElementById("historyTrend");
const historyTrendTooltipEl = document.getElementById("historyTrendTooltip");
const historyExportJsonBtn = document.getElementById("historyExportJsonBtn");
const historyExportCsvBtn = document.getElementById("historyExportCsvBtn");
const historyClearBtn = document.getElementById("historyClearBtn");

const canvas = document.getElementById("viewer");
const ctx = canvas.getContext("2d");
const DEFAULT_CANVAS_WIDTH = getPositiveInteger(canvas?.getAttribute("width"), 680);
const DEFAULT_CANVAS_HEIGHT = getPositiveInteger(canvas?.getAttribute("height"), DEFAULT_CANVAS_WIDTH);

if (!ctx) {
  throw new Error("Canvas context not available.");
}
if (
  !monitorWidthInput ||
  !monitorWidthConfirmBtn ||
  !viewDistanceInput ||
  !vergenceModeInput ||
  !visualPresetInput ||
  !startPdInput ||
  !goalPdInput ||
  !sessionMinutesInput ||
  !roundSecondsInput ||
  !fieldShapeInput ||
  !fieldSizeInput ||
  !verticalPolarityInput ||
  !leftDotIntensityInput ||
  !leftDotIntensityValueEl ||
  !rightDotIntensityInput ||
  !rightDotIntensityValueEl ||
  !lrSplitInput
) {
  throw new Error("Training config input(s) missing.");
}
if (!prismEl || !goalPdHudEl || !sessionTimerEl) {
  throw new Error("HUD element(s) missing.");
}
if (!pauseCardEl || !pauseExerciseNameEl || !pauseVergenceModeEl || !pauseLrSplitEl) {
  throw new Error("Pause card element(s) missing.");
}
if (
  !summaryCardEl ||
  !sumResultEl ||
  !sumBestPdEl ||
  !sumGoalPdEl ||
  !sumScoreEl ||
  !sumExerciseScoresEl ||
  !sumRangesEl ||
  !sumFacilityEl ||
  !sumRoundsEl ||
  !sumDurationEl ||
  !sumCorrectEl ||
  !sumWrongEl ||
  !sumTimeoutsEl ||
  !sumSkipsEl ||
  !sumSuppressionsEl
) {
  throw new Error("Summary element(s) missing.");
}
if (
  !historyCardEl ||
  !historyEmptyEl ||
  !historyTableEl ||
  !historyTableBodyEl ||
  !historyTrendWrapEl ||
  !historyTrendEl ||
  !historyTrendTooltipEl ||
  !historyExportJsonBtn ||
  !historyExportCsvBtn ||
  !historyClearBtn
) {
  throw new Error("History element(s) missing.");
}

const state = {
  running: false,
  paused: false,
  awaitingNextRound: false,
  resumeStartsNextRound: false,
  monitorWidthNeedsReconfirm: false,
  score: 0,
  currentPd: 0,
  bestPd: 0,
  goalPd: DEFAULT_GOAL_PD,
  vergenceMode: DEFAULT_VERGENCE_MODE,
  fieldShape: DEFAULT_FIELD_SHAPE_VALUE,
  fieldSize: DEFAULT_FIELD_SIZE_VALUE,
  verticalPolarity: DEFAULT_VERTICAL_POLARITY,
  visualPreset: DEFAULT_VISUAL_PRESET_VALUE,
  visualTuning: DEFAULT_VISUAL_TUNING,
  roundVergence: DEFAULT_VERGENCE_MODE,
  difficultySteps: 0,
  monitorWidthIn: DEFAULT_MONITOR_WIDTH_IN,
  viewDistanceIn: DEFAULT_VIEW_DISTANCE_IN,
  leftDotIntensity: DEFAULT_LEFT_DOT_INTENSITY,
  rightDotIntensity: DEFAULT_RIGHT_DOT_INTENSITY,
  correctCount: 0,
  wrongCount: 0,
  skipCount: 0,
  timeoutCount: 0,
  suppressionCount: 0,
  staircaseStreak: 0,
  facilityPhase: 0,
  metricsByExercise: Object.create(null),
  vergenceRanges: Object.create(null),
  sessionDurationMs: DEFAULT_SESSION_MINUTES * 60_000,
  roundDurationMs: DEFAULT_ROUND_SECONDS * 1000,
  round: 0,
  targetSide: "up",
  modeSequenceSeed: 0,
  roundSeed: 0,
  roundStartTs: 0,
  roundEndTs: 0,
  sessionStartTs: 0,
  sessionEndTs: 0,
  lastResponseTs: performance.now(),
  nowTs: performance.now(),
  pausedAtTs: 0,
  confirmedDisplayContext: null,
  dots: buildDotField(INITIAL_DOT_COUNT, getFieldExtentForSize(DEFAULT_FIELD_SIZE_VALUE), 1001, DEFAULT_VISUAL_TUNING),
  lastRoundEvent: "idle",
  lastInputSide: "-",
  lastTargetSide: "-",
  lastDifficultyDeltaPd: 0,
  monitorWidthConfirmed: false
};

let tickIntervalId = null;
let nextRoundTimeoutId = null;
let audioCtx = null;
let wasFullscreenActive = isFullscreenActive();
let viewportRefreshFrameId = null;

// Trend chart palette validated for CVD separation and contrast on #121212.
const TREND_SERIES = Object.freeze([
  { key: "bestPd", label: "Best PD", color: "#28a878" },
  { key: "breakPd", label: "Break point", color: "#5b8ae6" }
]);
const TREND_MAX_SESSIONS = 60;
const TREND_MARGIN = Object.freeze({ top: 8, right: 12, bottom: 20, left: 40 });
let trendModel = null;

let startInFlight = false;

startBtn.addEventListener("click", async () => {
  if (startInFlight || state.running) return;
  startInFlight = true;
  try {
    if (!state.paused && state.monitorWidthConfirmed && detectDisplayContextChange()) {
      updateStatus(getMonitorWidthBlockedMessage(), true);
      focusMonitorWidthInput();
      return;
    }
    if (!state.paused && !state.monitorWidthConfirmed) {
      updateStatus(getMonitorWidthBlockedMessage(), true);
      focusMonitorWidthInput();
      return;
    }
    ensureAudioContext();
    await requestFullscreenOnStart();
    if (state.paused) {
      resumeSession();
      return;
    }
    startSession();
  } finally {
    startInFlight = false;
  }
});
resetBtn.addEventListener("click", resetSession);

monitorWidthInput.addEventListener("change", onConfigChange);
monitorWidthConfirmBtn.addEventListener("click", confirmMonitorWidth);
viewDistanceInput.addEventListener("change", onConfigChange);
vergenceModeInput.addEventListener("change", onConfigChange);
visualPresetInput.addEventListener("change", onConfigChange);
startPdInput.addEventListener("change", onConfigChange);
goalPdInput.addEventListener("change", onConfigChange);
sessionMinutesInput.addEventListener("change", onConfigChange);
roundSecondsInput.addEventListener("change", onConfigChange);
fieldShapeInput.addEventListener("change", onConfigChange);
fieldSizeInput.addEventListener("change", onConfigChange);
verticalPolarityInput.addEventListener("change", onConfigChange);
leftDotIntensityInput.addEventListener("input", onConfigChange);
leftDotIntensityInput.addEventListener("change", onConfigChange);
rightDotIntensityInput.addEventListener("input", onConfigChange);
rightDotIntensityInput.addEventListener("change", onConfigChange);

window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", queueViewportRefresh);
window.visualViewport?.addEventListener("resize", queueViewportRefresh);
if (debugDownBtn) {
  debugDownBtn.addEventListener("click", () => applyDebugDifficultyAdjustment(-1, "button"));
}
if (debugUpBtn) {
  debugUpBtn.addEventListener("click", () => applyDebugDifficultyAdjustment(1, "button"));
}
historyTrendEl.addEventListener("mousemove", onTrendHover);
historyTrendEl.addEventListener("mouseleave", onTrendHoverEnd);
historyExportJsonBtn.addEventListener("click", exportSessionHistoryJson);
historyExportCsvBtn.addEventListener("click", exportSessionHistoryCsv);
historyClearBtn.addEventListener("click", clearSessionHistoryWithConfirm);
window.addEventListener("blur", pauseSessionForFocusLoss);
document.addEventListener("visibilitychange", onVisibilityChange);
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

initializeConfigInputs();
renderSessionHistory();
refreshIdlePreview();

function startSession() {
  const config = readConfigInputs();
  applyConfigInputs(config);
  persistConfig(config);
  clearPendingNextRound();
  state.resumeStartsNextRound = false;

  state.running = true;
  state.paused = false;
  state.pausedAtTs = 0;
  resetScoringState();
  applyConfigToState(config);
  state.round = 0;
  state.facilityPhase = 0;
  state.modeSequenceSeed = ((Math.random() * 0xffffffff) | 0) >>> 0;
  state.roundVergence = resolveRoundVergence(config.vergenceMode, 1, state.modeSequenceSeed);

  state.sessionStartTs = performance.now();
  state.sessionEndTs = state.sessionStartTs + state.sessionDurationMs;
  state.nowTs = state.sessionStartTs;
  state.lastResponseTs = state.sessionStartTs;
  setRoundDebugState("start", "-", "-", 0);

  setInputsDisabled(true);
  setStartButtonLabel();
  syncSessionLayoutMode();
  hideSummaryCard();

  updateStatus(
    `Session started: ${config.sessionMinutes} min, round ${config.roundSeconds}s, session target ${formatPd(config.goalPd)}Δ, mode ${formatVergenceLabel(config.vergenceMode)}, visual ${formatVisualPresetLabel(config.visualPreset)}. Estimated start ${formatPd(state.currentPd)}Δ.`
  );
  startRound();
}

function resetSession() {
  const config = readConfigInputs();
  applyConfigInputs(config);
  persistConfig(config);
  clearPendingNextRound();
  state.resumeStartsNextRound = false;

  state.running = false;
  state.paused = false;
  state.pausedAtTs = 0;
  resetScoringState();
  applyConfigToState(config);
  state.round = 0;
  state.facilityPhase = 0;
  state.modeSequenceSeed = 0;
  state.roundVergence = resolveRoundVergence(config.vergenceMode, 1, state.modeSequenceSeed);
  state.targetSide = "up";
  state.roundSeed = 1001;
  state.roundStartTs = 0;
  state.roundEndTs = 0;
  state.sessionStartTs = 0;
  state.sessionEndTs = 0;
  state.nowTs = performance.now();
  state.lastResponseTs = state.nowTs;
  state.dots = buildDotField(INITIAL_DOT_COUNT, getFieldExtent(), state.roundSeed, state.visualTuning);
  setRoundDebugState("idle", "-", "-", 0);

  stopRoundTicker();
  setInputsDisabled(false);
  setStartButtonLabel();
  syncMonitorWidthSetupUi();
  syncSessionLayoutMode();
  hideSummaryCard();

  if (!state.monitorWidthConfirmed) {
    updateStatus(`Reset complete. ${getMonitorWidthBlockedMessage()}`, true);
  } else {
    updateStatus(
      `Reset complete. Press Start for ${config.sessionMinutes} min. Round ${config.roundSeconds}s, start ${formatPd(state.currentPd)}Δ, session target ${formatPd(config.goalPd)}Δ, mode ${formatVergenceLabel(config.vergenceMode)}, visual ${formatVisualPresetLabel(config.visualPreset)}.`
    );
  }
  updateHud();
  renderScene();
}

function onConfigChange(event) {
  if (state.running || state.paused) return;
  if (event?.target === monitorWidthInput) {
    const monitorWidthCandidate = Number.parseFloat(monitorWidthInput.value);
    state.monitorWidthConfirmed = Number.isFinite(monitorWidthCandidate);
    state.monitorWidthNeedsReconfirm = false;
    state.confirmedDisplayContext = state.monitorWidthConfirmed ? getCurrentDisplayContext() : null;
  }

  const config = readConfigInputs();
  applyConfigInputs(config);
  persistConfig(config);
  syncMonitorWidthSetupUi();

  applyConfigToState(config);
  state.nowTs = performance.now();
  state.lastResponseTs = state.nowTs;
  updateReadyStatus(config);
  updateHud();
  renderScene();
  hideSummaryCard();
}

function confirmMonitorWidth() {
  if (state.running || state.paused) return;

  const monitorWidthCandidate = Number.parseFloat(monitorWidthInput.value);
  if (!Number.isFinite(monitorWidthCandidate)) {
    updateStatus("Enter a valid Monitor Width before confirming it.", true);
    focusMonitorWidthInput();
    return;
  }

  onConfigChange({ target: monitorWidthInput });
}

function queueViewportRefresh() {
  if (viewportRefreshFrameId !== null) return;
  viewportRefreshFrameId = window.requestAnimationFrame(() => {
    viewportRefreshFrameId = null;
    refreshViewport();
  });
}

function refreshViewport() {
  state.nowTs = performance.now();
  state.dots = buildDotField(getCurrentDotCount(), getFieldExtent(), state.roundSeed || 1001, state.visualTuning);
  updateHud();
  renderScene();
  renderSessionTrend();
}

function getCurrentDotCount() {
  return isTrainingActive() ? ROUND_DOT_COUNT : INITIAL_DOT_COUNT;
}

function startRound() {
  if (!state.running) return;
  clearPendingNextRound();
  state.resumeStartsNextRound = false;

  const now = performance.now();
  state.nowTs = now;
  if (now >= state.sessionEndTs) {
    endSession();
    return;
  }

  state.round += 1;
  state.roundVergence = resolveRoundVergence(state.vergenceMode, state.round, state.modeSequenceSeed);
  if (isFacilityMode()) {
    // Facility phase advances only on correct answers, so a missed pair is
    // retried at the same fixed demand instead of drifting like the staircase.
    state.roundVergence = resolveRoundVergence("facility", state.facilityPhase + 1, state.modeSequenceSeed);
    state.difficultySteps = pdToDifficultySteps(
      getFacilityDemandPd(state.roundVergence),
      state.monitorWidthIn,
      state.viewDistanceIn
    );
    state.currentPd = difficultyToPd(state.difficultySteps, state.monitorWidthIn, state.viewDistanceIn);
    state.bestPd = Math.max(state.bestPd, state.currentPd);
  }
  state.targetSide = SIDES[(Math.random() * SIDES.length) | 0];
  state.roundSeed = ((Math.random() * 0xffffffff) | 0) >>> 0;
  state.roundStartTs = now;
  state.roundEndTs = state.roundStartTs + state.roundDurationMs;

  const fieldExtent = getFieldExtent();
  state.dots = buildDotField(ROUND_DOT_COUNT, fieldExtent, state.roundSeed, state.visualTuning);
  setRoundDebugState("pending", "-", state.targetSide, 0);

  startRoundTicker();

  updateHud();
  renderScene();
}

function startRoundTicker() {
  stopRoundTicker();
  tickIntervalId = setInterval(() => {
    state.nowTs = performance.now();

    if (state.nowTs - state.lastResponseTs >= INACTIVITY_PAUSE_MS) {
      pauseSessionForInactivity();
      return;
    }

    if (state.nowTs >= state.sessionEndTs) {
      endSession();
      return;
    }

    if (state.nowTs >= state.roundEndTs) {
      handleRoundTimeout();
      return;
    }

    updateHud();
  }, TICK_MS);
}

function handleRoundTimeout() {
  if (!state.running) return;

  stopRoundTicker();

  const timeoutScore = recordScoringEvent("timeout", state.roundVergence);
  state.staircaseStreak = 0;
  const pdDelta = isFacilityMode() ? 0 : applyPdDelta(-PD_LOSS_PER_ERROR);
  setRoundDebugState("timeout", "-", state.targetSide, pdDelta);
  playNegativeFeedbackBeep();
  updateStatus(`Round timeout (${formatExerciseLabel(timeoutScore.exerciseKey)}). Score -1.`, true);
  updateHud();

  scheduleNextRoundAfterDelay(() => {
    if (!state.running) return;
    if (performance.now() >= state.sessionEndTs) {
      endSession();
      return;
    }
    startRound();
  });
}

function onKeyDown(event) {
  if (event.repeat && !shouldAllowRepeatedDebugHotkey(event)) return;
  if (handlePauseToggleHotkey(event)) return;
  if (handleDebugDifficultyHotkeys(event)) return;
  if (hasKeyModifier(event)) {
    // Never score a modified keypress, but keep shortcuts like Cmd+ArrowLeft
    // (history back) from killing a live session.
    if (state.running && (event.code === "Space" || event.code === "KeyS" || SIDE_KEYS[event.key])) {
      event.preventDefault();
    }
    return;
  }
  if (!state.running) return;
  if (state.awaitingNextRound) {
    if (event.code === "Space" || event.code === "KeyS" || SIDE_KEYS[event.key]) {
      event.preventDefault();
    }
    return;
  }

  if (event.code === "KeyS") {
    event.preventDefault();
    state.lastResponseTs = performance.now();
    const suppressionScore = recordScoringEvent("suppression", state.roundVergence);
    state.staircaseStreak = 0;
    const pdDelta = isFacilityMode() ? 0 : applyPdDelta(-PD_LOSS_PER_ERROR);
    setRoundDebugState("suppression", "s", state.targetSide, pdDelta);
    playNegativeFeedbackBeep();
    updateStatus(
      `Suppression reported (${formatExerciseLabel(suppressionScore.exerciseKey)}). Demand reduced. Blink and refocus; both marker dots should stay visible.`,
      true
    );
    updateHud();
    startRound();
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    state.lastResponseTs = performance.now();
    const skipScore = recordScoringEvent("skip", state.roundVergence);
    state.staircaseStreak = 0;
    const breakRecorded = coreRecordRangeBreak(state.vergenceRanges, state.roundVergence, state.currentPd);
    const breakText = breakRecorded ? ` Break recorded at ${formatPd(state.currentPd)}Δ.` : "";
    const pdDelta = isFacilityMode() ? 0 : applyPdDelta(-PD_LOSS_PER_ERROR);
    setRoundDebugState("skip", "space", state.targetSide, pdDelta);
    playNegativeFeedbackBeep();
    updateStatus(`Marked unseen (${formatExerciseLabel(skipScore.exerciseKey)}). Score -1.${breakText} New stereogram.`, true);
    updateHud();
    startRound();
    return;
  }

  const side = SIDE_KEYS[event.key];
  if (!side) return;

  event.preventDefault();
  state.lastResponseTs = performance.now();
  const correct = side === state.targetSide;

  if (correct) {
    const correctScore = recordScoringEvent("correct", state.roundVergence);
    const recoveryPair = coreRecordRangeRecovery(state.vergenceRanges, state.roundVergence, state.currentPd);
    let pdDelta = 0;
    let progressText;
    if (isFacilityMode()) {
      state.facilityPhase += 1;
      progressText = `Cycles ${getFacilityCycles()} (${getFacilityCpm().toFixed(1)} cpm).`;
    } else {
      const staircase = coreAdvanceStaircase(state.staircaseStreak, "correct", STAIRCASE_CORRECT_PER_STEP_UP);
      state.staircaseStreak = staircase.consecutiveCorrect;
      pdDelta = staircase.direction > 0 ? applyPdDelta(PD_GAIN_PER_CORRECT) : 0;
      progressText = staircase.direction > 0
        ? `Demand up to ${formatPd(state.currentPd)}Δ.`
        : `Streak ${staircase.consecutiveCorrect}/${STAIRCASE_CORRECT_PER_STEP_UP} at ${formatPd(state.currentPd)}Δ.`;
    }
    setRoundDebugState("correct", side, state.targetSide, pdDelta);
    playPositiveFeedbackBeep();

    if (recoveryPair) {
      progressText = `Recovery at ${formatPd(recoveryPair.recoveryPd)}Δ (break ${formatPd(recoveryPair.breakPd)}Δ). ${progressText}`;
    }
    if (state.bestPd >= state.goalPd) {
      updateStatus(
        `Correct (${side}, ${formatExerciseLabel(correctScore.exerciseKey)}). Score +1. Session target reached at ${formatPd(state.bestPd)}Δ.`
      );
    } else {
      updateStatus(
        `Correct (${side}, ${formatExerciseLabel(correctScore.exerciseKey)}). Score +1. ${progressText}`
      );
    }
  } else {
    const wrongScore = recordScoringEvent("wrong", state.roundVergence);
    state.staircaseStreak = 0;
    const pdDelta = isFacilityMode() ? 0 : applyPdDelta(-PD_LOSS_PER_ERROR);
    setRoundDebugState("wrong", side, state.targetSide, pdDelta);
    playNegativeFeedbackBeep();
    updateStatus(`Wrong (${side}, ${formatExerciseLabel(wrongScore.exerciseKey)}). Score -1.`, true);
  }

  updateHud();
  startRound();
}

function shouldAllowRepeatedDebugHotkey(event) {
  if (!DEBUG_MODE) return false;
  if (isEditableTarget(event.target)) return false;
  return getDebugDifficultyDirection(event) !== 0;
}

function hasKeyModifier(event) {
  return Boolean(event.ctrlKey || event.metaKey || event.altKey);
}

function handlePauseToggleHotkey(event) {
  if (event.code !== "KeyP") return false;
  if (hasKeyModifier(event)) return false;
  if (isEditableTarget(event.target)) return false;
  if (!state.running && !state.paused) return false;

  event.preventDefault();
  if (state.running) {
    pauseSessionByUser("Press Resume or P to continue.");
    exitFullscreenIfActive();
  } else {
    resumeSessionWithFullscreen();
  }
  return true;
}

function handleDebugDifficultyHotkeys(event) {
  if (!DEBUG_MODE) return false;
  if (isEditableTarget(event.target)) return false;

  const direction = getDebugDifficultyDirection(event);
  if (direction === 0) return false;

  event.preventDefault();
  applyDebugDifficultyAdjustment(direction, "key");
  return true;
}

function getDebugDifficultyDirection(event) {
  return coreGetDebugDifficultyDirection(event);
}

function applyDebugDifficultyAdjustment(direction, source) {
  if (!DEBUG_MODE) return;
  if (direction !== 1 && direction !== -1) return;

  const pdDelta = applyDifficultyDelta(direction);
  const pdDeltaText = `${pdDelta >= 0 ? "+" : ""}${pdDelta.toFixed(1)}Δ`;
  const directionText = direction > 0 ? "up" : "down";
  const eventPrefix = source === "button" ? "debugBtn" : "debugKey";
  const activeTargetSide = state.running ? state.targetSide : "-";

  setRoundDebugState(
    direction > 0 ? `${eventPrefix}+` : `${eventPrefix}-`,
    direction > 0 ? "+" : "-",
    activeTargetSide,
    pdDelta
  );
  state.nowTs = performance.now();
  updateStatus(`Debug difficulty ${directionText}: 1 step (${pdDeltaText}).`);
  updateHud();
  renderScene();
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target.isContentEditable;
}

function endSession() {
  if (!state.running) return;

  clearPendingNextRound();
  state.resumeStartsNextRound = false;
  state.running = false;
  state.paused = false;
  state.pausedAtTs = 0;
  stopRoundTicker();
  state.nowTs = performance.now();
  setInputsDisabled(false);
  setStartButtonLabel();
  syncSessionLayoutMode();

  const reachedGoal = state.bestPd >= state.goalPd;
  showSummaryCard(reachedGoal);
  appendSessionHistoryRecord(buildSessionHistoryRecord(reachedGoal));
  renderSessionHistory();

  if (reachedGoal) {
    beep(1080, 130);
    updateStatus(`Session complete. Target met: best ${formatPd(state.bestPd)}Δ (target ${formatPd(state.goalPd)}Δ).`);
  } else {
    beep(660, 140);
    updateStatus(`Session complete. Target not met: best ${formatPd(state.bestPd)}Δ (target ${formatPd(state.goalPd)}Δ).`, true);
  }

  updateHud();
  renderScene();
}

function initializeConfigInputs() {
  document.body.classList.toggle("debug-mode", DEBUG_MODE);

  monitorWidthInput.min = String(MIN_MONITOR_WIDTH_IN);
  monitorWidthInput.max = String(MAX_MONITOR_WIDTH_IN);
  monitorWidthInput.step = "0.5";
  monitorWidthInput.value = String(DEFAULT_MONITOR_WIDTH_IN);

  viewDistanceInput.min = String(MIN_VIEW_DISTANCE_IN);
  viewDistanceInput.max = String(MAX_VIEW_DISTANCE_IN);
  viewDistanceInput.step = "0.5";
  viewDistanceInput.value = String(DEFAULT_VIEW_DISTANCE_IN);

  populateVergenceModeInput();
  populateVisualPresetInput();

  startPdInput.min = "0";
  startPdInput.max = String(ABSOLUTE_PD_MAX);
  startPdInput.step = "1";
  startPdInput.value = String(DEFAULT_START_PD);

  goalPdInput.min = "1";
  goalPdInput.max = String(ABSOLUTE_PD_MAX);
  goalPdInput.step = "1";
  goalPdInput.value = String(DEFAULT_GOAL_PD);

  sessionMinutesInput.min = "1";
  sessionMinutesInput.max = String(ABSOLUTE_SESSION_MINUTES_MAX);
  sessionMinutesInput.step = "1";
  sessionMinutesInput.value = String(DEFAULT_SESSION_MINUTES);

  roundSecondsInput.min = String(MIN_ROUND_SECONDS);
  roundSecondsInput.max = String(MAX_ROUND_SECONDS);
  roundSecondsInput.step = "1";
  roundSecondsInput.value = String(DEFAULT_ROUND_SECONDS);
  fieldShapeInput.value = DEFAULT_FIELD_SHAPE_VALUE;
  fieldSizeInput.value = DEFAULT_FIELD_SIZE_VALUE;
  verticalPolarityInput.value = DEFAULT_VERTICAL_POLARITY;

  if (debugStatusEl) {
    debugStatusEl.hidden = !DEBUG_MODE;
  }
  if (debugControlsEl) {
    debugControlsEl.hidden = !DEBUG_MODE;
  }
  if (CLEAR_SAVED_CONFIG_ON_LOAD) {
    clearPersistedConfig();
    clearOneShotUrlFlags();
  }

  const persistedConfig = hydratePersistedConfigIntoInputs();
  state.monitorWidthNeedsReconfirm = shouldRequireMonitorWidthReconfirm(persistedConfig);
  state.monitorWidthConfirmed = !state.monitorWidthNeedsReconfirm && getPersistedMonitorWidthConfirmed(persistedConfig);
  state.confirmedDisplayContext = getPersistedDisplayContext(persistedConfig);
  const sanitizedConfig = readConfigInputs();
  applyConfigInputs(sanitizedConfig);
  persistConfig(sanitizedConfig);
  syncMonitorWidthSetupUi();
  syncSessionLayoutMode();
}

function readConfigInputs() {
  const monitorWidthRaw = Number.parseFloat(monitorWidthInput.value);
  const viewDistanceRaw = Number.parseFloat(viewDistanceInput.value);
  const vergenceMode = normalizeVergenceMode(vergenceModeInput.value);
  const fieldShape = normalizeFieldShape(fieldShapeInput.value);
  const fieldSize = normalizeFieldSize(fieldSizeInput.value);
  const verticalPolarity = normalizeVerticalPolarity(verticalPolarityInput.value);
  const visualPreset = normalizeVisualPreset(visualPresetInput.value);
  const startPdRaw = DEBUG_MODE ? Number.parseInt(startPdInput.value, 10) : DEFAULT_START_PD;
  const goalPdRaw = Number.parseInt(goalPdInput.value, 10);
  const sessionMinutesRaw = Number.parseInt(sessionMinutesInput.value, 10);
  const roundSecondsRaw = Number.parseInt(roundSecondsInput.value, 10);

  const monitorWidthIn = clampFloat(monitorWidthRaw, MIN_MONITOR_WIDTH_IN, MAX_MONITOR_WIDTH_IN, DEFAULT_MONITOR_WIDTH_IN);
  const viewDistanceIn = clampFloat(viewDistanceRaw, MIN_VIEW_DISTANCE_IN, MAX_VIEW_DISTANCE_IN, DEFAULT_VIEW_DISTANCE_IN);
  const leftDotIntensity = clampFloat(
    Number.parseFloat(leftDotIntensityInput.value), MIN_DOT_INTENSITY, MAX_DOT_INTENSITY, DEFAULT_LEFT_DOT_INTENSITY
  );
  const rightDotIntensity = clampFloat(
    Number.parseFloat(rightDotIntensityInput.value), MIN_DOT_INTENSITY, MAX_DOT_INTENSITY, DEFAULT_RIGHT_DOT_INTENSITY
  );
  const startPd = clampInt(startPdRaw, 0, ABSOLUTE_PD_MAX, DEFAULT_START_PD);
  const goalPd = clampInt(goalPdRaw, 1, ABSOLUTE_PD_MAX, DEFAULT_GOAL_PD);
  const sessionMinutes = clampInt(sessionMinutesRaw, 1, ABSOLUTE_SESSION_MINUTES_MAX, DEFAULT_SESSION_MINUTES);
  const roundSeconds = clampInt(roundSecondsRaw, MIN_ROUND_SECONDS, MAX_ROUND_SECONDS, DEFAULT_ROUND_SECONDS);

  return {
    monitorWidthIn,
    viewDistanceIn,
    leftDotIntensity,
    rightDotIntensity,
    vergenceMode,
    fieldShape,
    fieldSize,
    verticalPolarity,
    visualPreset,
    startPd,
    goalPd,
    sessionMinutes,
    roundSeconds
  };
}

function hydratePersistedConfigIntoInputs() {
  const persisted = readPersistedConfig();
  if (!persisted) return null;

  if (Number.isFinite(persisted.monitorWidthIn)) {
    monitorWidthInput.value = String(persisted.monitorWidthIn);
  }
  if (Number.isFinite(persisted.viewDistanceIn)) {
    viewDistanceInput.value = String(persisted.viewDistanceIn);
  }
  if (Number.isFinite(persisted.leftDotIntensity)) {
    leftDotIntensityInput.value = String(persisted.leftDotIntensity);
  }
  if (Number.isFinite(persisted.rightDotIntensity)) {
    rightDotIntensityInput.value = String(persisted.rightDotIntensity);
  }
  if (typeof persisted.vergenceMode === "string") {
    vergenceModeInput.value = persisted.vergenceMode;
  }
  if (typeof persisted.fieldShape === "string") {
    fieldShapeInput.value = persisted.fieldShape;
  }
  if (typeof persisted.fieldSize === "string") {
    fieldSizeInput.value = persisted.fieldSize;
  }
  if (typeof persisted.verticalPolarity === "string") {
    verticalPolarityInput.value = persisted.verticalPolarity;
  }
  if (typeof persisted.visualPreset === "string") {
    visualPresetInput.value = persisted.visualPreset;
  }
  if (DEBUG_MODE && Number.isFinite(persisted.startPd)) {
    startPdInput.value = String(Math.trunc(persisted.startPd));
  }
  if (Number.isFinite(persisted.goalPd)) {
    goalPdInput.value = String(Math.trunc(persisted.goalPd));
  }
  if (Number.isFinite(persisted.sessionMinutes)) {
    sessionMinutesInput.value = String(Math.trunc(persisted.sessionMinutes));
  }
  if (Number.isFinite(persisted.roundSeconds)) {
    roundSecondsInput.value = String(Math.trunc(persisted.roundSeconds));
  }
  return persisted;
}

function readPersistedConfig() {
  try {
    const raw = window.localStorage?.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedConfig() {
  try {
    window.localStorage?.removeItem(CONFIG_STORAGE_KEY);
  } catch {
    // Ignore storage errors (privacy mode, blocked storage, etc.).
  }
}

function persistConfig(config) {
  const payload = {
    monitorWidthIn: config.monitorWidthIn,
    monitorWidthConfirmed: state.monitorWidthConfirmed,
    monitorWidthNeedsReconfirm: state.monitorWidthNeedsReconfirm,
    displayContext: state.confirmedDisplayContext,
    viewDistanceIn: config.viewDistanceIn,
    leftDotIntensity: config.leftDotIntensity,
    rightDotIntensity: config.rightDotIntensity,
    vergenceMode: config.vergenceMode,
    fieldShape: config.fieldShape,
    fieldSize: config.fieldSize,
    verticalPolarity: config.verticalPolarity,
    visualPreset: config.visualPreset,
    startPd: config.startPd,
    goalPd: config.goalPd,
    sessionMinutes: config.sessionMinutes,
    roundSeconds: config.roundSeconds
  };

  try {
    window.localStorage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors (privacy mode, blocked storage, etc.).
  }
}

function applyConfigInputs(config) {
  monitorWidthInput.value = formatInches(config.monitorWidthIn);
  viewDistanceInput.value = formatInches(config.viewDistanceIn);
  leftDotIntensityInput.value = String(config.leftDotIntensity);
  leftDotIntensityValueEl.textContent = config.leftDotIntensity.toFixed(2);
  rightDotIntensityInput.value = String(config.rightDotIntensity);
  rightDotIntensityValueEl.textContent = config.rightDotIntensity.toFixed(2);
  vergenceModeInput.value = normalizeVergenceMode(config.vergenceMode);
  fieldShapeInput.value = normalizeFieldShape(config.fieldShape);
  fieldSizeInput.value = normalizeFieldSize(config.fieldSize);
  verticalPolarityInput.value = normalizeVerticalPolarity(config.verticalPolarity);
  visualPresetInput.value = normalizeVisualPreset(config.visualPreset);
  startPdInput.value = String(config.startPd);
  goalPdInput.value = String(config.goalPd);
  sessionMinutesInput.value = String(config.sessionMinutes);
  roundSecondsInput.value = String(config.roundSeconds);
}

function getPersistedMonitorWidthConfirmed(persisted) {
  if (!persisted || typeof persisted !== "object") return false;
  if (typeof persisted.monitorWidthConfirmed === "boolean") {
    return persisted.monitorWidthConfirmed;
  }
  // Backward-compatible: existing saved monitor width counts as confirmed.
  return Number.isFinite(persisted.monitorWidthIn);
}

function getCurrentDisplayContext() {
  return coreNormalizeDisplayContext(
    window.screen?.width || 0,
    window.screen?.height || 0,
    window.devicePixelRatio || 1
  );
}

function getPersistedDisplayContext(persisted) {
  if (!persisted || typeof persisted !== "object") return null;
  const rawContext = persisted.displayContext;
  if (!rawContext || typeof rawContext !== "object") return null;
  return coreNormalizeDisplayContext(
    rawContext.screenWidth,
    rawContext.screenHeight,
    rawContext.devicePixelRatio
  );
}

function shouldRequireMonitorWidthReconfirm(persisted) {
  if (!persisted || typeof persisted !== "object") return false;
  if (persisted.monitorWidthNeedsReconfirm === true) return true;
  if (!getPersistedMonitorWidthConfirmed(persisted)) return false;
  if (!Number.isFinite(persisted.monitorWidthIn)) return false;

  const savedDisplayContext = getPersistedDisplayContext(persisted);
  if (!savedDisplayContext) return true;

  return !coreIsSameDisplayContext(savedDisplayContext, getCurrentDisplayContext());
}

function detectDisplayContextChange() {
  if (!state.monitorWidthConfirmed) return false;
  if (coreIsSameDisplayContext(state.confirmedDisplayContext, getCurrentDisplayContext())) {
    return false;
  }

  state.monitorWidthConfirmed = false;
  state.monitorWidthNeedsReconfirm = true;
  persistConfig(readConfigInputs());
  syncMonitorWidthSetupUi();
  return true;
}

function isZoomOnlyContextChange() {
  const saved = state.confirmedDisplayContext;
  if (!saved) return false;
  const current = getCurrentDisplayContext();
  return saved.screenWidth === current.screenWidth &&
    saved.screenHeight === current.screenHeight &&
    saved.devicePixelRatio !== current.devicePixelRatio;
}

function getMonitorWidthBlockedMessage() {
  if (!state.monitorWidthNeedsReconfirm) {
    return "Set and confirm Monitor Width in Advanced Settings before starting. This is saved for future sessions.";
  }
  if (isZoomOnlyContextChange()) {
    return "Browser zoom or display scaling changed since Monitor Width was confirmed. Reset zoom to 100%, then reconfirm Monitor Width in Advanced Settings.";
  }
  return "Reconfirm Monitor Width in Advanced Settings before starting because the display context changed.";
}

function syncMonitorWidthSetupUi() {
  const needsWidth = !state.monitorWidthConfirmed;
  if (advancedSetupEl instanceof HTMLDetailsElement) {
    advancedSetupEl.classList.toggle("needs-attention", needsWidth);
    if (needsWidth) {
      advancedSetupEl.open = true;
    }
  }
  monitorWidthConfirmBtn.hidden = state.running || state.paused || !needsWidth;
  monitorWidthConfirmBtn.textContent = state.monitorWidthNeedsReconfirm ? "Reconfirm" : "Confirm";
}

function updateReadyStatus(config) {
  const readyText =
    `Ready: ${config.sessionMinutes} min, round ${config.roundSeconds}s, ` +
    `start ${formatPd(state.currentPd)}Δ, session target ${formatPd(config.goalPd)}Δ, ` +
    `mode ${formatVergenceLabel(config.vergenceMode)}, visual ${formatVisualPresetLabel(config.visualPreset)}.`;

  if (!state.monitorWidthConfirmed) {
    updateStatus(`${getMonitorWidthBlockedMessage()} ${readyText}`, true);
    return;
  }

  updateStatus(readyText);
}

function getCurrentTotalSplitPx() {
  return getBackgroundDisparity(state.difficultySteps) + getSquareDisparity(state.difficultySteps);
}

function getDisplayRoundVergence() {
  return state.running || state.paused
    ? state.roundVergence
    : resolveRoundVergence(state.vergenceMode, 1, state.modeSequenceSeed);
}

function formatSplitPx(splitPx, roundVergence = getDisplayRoundVergence()) {
  const axisCode = getVergenceAxis(roundVergence) === "vertical" ? "V" : "H";
  return `${splitPx.toFixed(0)} px ${axisCode}`;
}

function updateSplitReadouts() {
  const splitText = formatSplitPx(getCurrentTotalSplitPx(), getDisplayRoundVergence());
  lrSplitInput.value = splitText;
  pauseLrSplitEl.textContent = splitText;
}

function focusMonitorWidthInput() {
  if (advancedSetupEl instanceof HTMLDetailsElement) {
    advancedSetupEl.open = true;
  }
  monitorWidthInput.focus();
  monitorWidthInput.select();
}

function setInputsDisabled(disabled) {
  monitorWidthInput.disabled = disabled;
  monitorWidthConfirmBtn.disabled = disabled;
  viewDistanceInput.disabled = disabled;
  vergenceModeInput.disabled = disabled;
  visualPresetInput.disabled = disabled;
  startPdInput.disabled = disabled;
  goalPdInput.disabled = disabled;
  sessionMinutesInput.disabled = disabled;
  roundSecondsInput.disabled = disabled;
  fieldShapeInput.disabled = disabled;
  fieldSizeInput.disabled = disabled;
  verticalPolarityInput.disabled = disabled;
  leftDotIntensityInput.disabled = disabled;
  rightDotIntensityInput.disabled = disabled;
  lrSplitInput.disabled = false;
}

function refreshIdlePreview() {
  const config = readConfigInputs();
  applyConfigInputs(config);
  applyConfigToState(config);
  state.paused = false;
  state.nowTs = performance.now();
  state.lastResponseTs = state.nowTs;
  setStartButtonLabel();

  updateReadyStatus(config);
  updateHud();
  renderScene();
  hideSummaryCard();
}

function applyConfigToState(config) {
  state.goalPd = config.goalPd;
  state.vergenceMode = config.vergenceMode;
  state.fieldShape = config.fieldShape;
  state.fieldSize = config.fieldSize;
  state.verticalPolarity = config.verticalPolarity;
  state.visualPreset = config.visualPreset;
  state.visualTuning = getVisualPresetTuning(config.visualPreset);
  state.monitorWidthIn = config.monitorWidthIn;
  state.viewDistanceIn = config.viewDistanceIn;
  state.leftDotIntensity = config.leftDotIntensity;
  state.rightDotIntensity = config.rightDotIntensity;
  state.difficultySteps = pdToDifficultySteps(config.startPd, config.monitorWidthIn, config.viewDistanceIn);
  state.currentPd = difficultyToPd(state.difficultySteps, state.monitorWidthIn, state.viewDistanceIn);
  state.bestPd = state.currentPd;
  state.sessionDurationMs = config.sessionMinutes * 60_000;
  state.roundDurationMs = config.roundSeconds * 1000;
  state.roundVergence = resolveRoundVergence(config.vergenceMode, 1, state.modeSequenceSeed);
  state.dots = buildDotField(INITIAL_DOT_COUNT, getFieldExtent(), state.roundSeed || 1001, state.visualTuning);
}

function resetScoringState() {
  state.score = 0;
  state.correctCount = 0;
  state.wrongCount = 0;
  state.skipCount = 0;
  state.timeoutCount = 0;
  state.suppressionCount = 0;
  state.staircaseStreak = 0;
  state.metricsByExercise = Object.create(null);
  state.vergenceRanges = Object.create(null);
}

function normalizeExerciseKey(value) {
  return coreNormalizeExerciseKey(value);
}

function recordScoringEvent(outcomeType, exerciseKey) {
  const result = coreRecordScoringEvent(state.metricsByExercise, outcomeType, exerciseKey);

  if (outcomeType === "correct") state.correctCount += 1;
  else if (outcomeType === "wrong") state.wrongCount += 1;
  else if (outcomeType === "skip") state.skipCount += 1;
  else if (outcomeType === "timeout") state.timeoutCount += 1;
  else if (outcomeType === "suppression") state.suppressionCount += 1;

  state.score += result.scoreDelta;
  return { ...result, totalScore: state.score };
}

function getExerciseScore(exerciseKey) {
  return coreGetExerciseScore(state.metricsByExercise, exerciseKey);
}

function getExpectedExerciseKeysForMode(mode, sampleRounds = 24) {
  const normalizedMode = normalizeVergenceMode(mode);
  if (normalizedMode === "alternate" || normalizedMode === "random_jump" || normalizedMode === "facility") {
    return ["convergence", "divergence"];
  }
  const keys = new Set();
  for (let round = 1; round <= sampleRounds; round += 1) {
    const resolved = normalizeExerciseKey(resolveRoundVergence(mode, round));
    if (resolved && resolved !== "alternate") {
      keys.add(resolved);
    }
  }
  return [...keys];
}

function getTrackedExerciseKeys() {
  const keys = new Set(Object.keys(state.metricsByExercise));
  const current = normalizeExerciseKey(state.roundVergence);
  if (current && current !== "alternate") {
    keys.add(current);
  }
  const expected = getExpectedExerciseKeysForMode(state.vergenceMode);
  for (const key of expected) {
    keys.add(key);
  }

  return [...keys].sort((a, b) => formatExerciseLabel(a).localeCompare(formatExerciseLabel(b)));
}

function formatExerciseLabel(exerciseKey) {
  const key = normalizeExerciseKey(exerciseKey);
  if (!key) return "Unassigned";
  if (key === "unassigned") return "Unassigned";
  const configured = VERGENCE_MODE_MAP.get(key);
  if (configured) {
    return configured.label;
  }
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatExerciseShortCode(exerciseKey) {
  const key = normalizeExerciseKey(exerciseKey);
  if (key === "convergence") return "C";
  if (key === "divergence") return "D";
  if (key === "vergence_up") return "VU";
  if (key === "vergence_down") return "VD";
  if (key === "unassigned") return "U";
  const label = formatExerciseLabel(key);
  return label.slice(0, 3).toUpperCase();
}

function formatScoreHudText() {
  const keys = getTrackedExerciseKeys();
  if (keys.length === 0) {
    return "0";
  }
  if (keys.length === 1) {
    return String(getExerciseScore(keys[0]));
  }
  return keys.map(key => `${formatExerciseShortCode(key)}:${getExerciseScore(key)}`).join(" ");
}

function formatExerciseScoresSummaryText() {
  const keys = getTrackedExerciseKeys();
  if (keys.length === 0) return "None";
  return keys.map(key => `${formatExerciseLabel(key)} ${getExerciseScore(key)}`).join(" | ");
}

function formatRangesSummaryText() {
  const parts = Object.keys(state.vergenceRanges)
    .map(key => ({ key, pair: coreGetBestRangePair(state.vergenceRanges, key) }))
    .filter(entry => entry.pair)
    .sort((a, b) => formatExerciseLabel(a.key).localeCompare(formatExerciseLabel(b.key)))
    .map(entry => `${formatExerciseShortCode(entry.key)} ${formatPd(entry.pair.breakPd)}/${formatPd(entry.pair.recoveryPd)}Δ`);
  return parts.length > 0 ? parts.join(" | ") : "-";
}

function isFacilityMode() {
  return normalizeVergenceMode(state.vergenceMode) === "facility";
}

function getFacilityDemandPd(roundVergence) {
  return roundVergence === "divergence" ? FACILITY_BASE_IN_PD : FACILITY_BASE_OUT_PD;
}

function getFacilityCycles() {
  return Math.floor(state.facilityPhase / 2);
}

function getSessionElapsedMs() {
  if (state.sessionEndTs <= 0) return 0;
  const clockNow = state.paused && state.pausedAtTs > 0 ? state.pausedAtTs : state.nowTs;
  return Math.max(0, state.sessionDurationMs - Math.max(0, state.sessionEndTs - clockNow));
}

function getFacilityCpm() {
  const elapsedMs = getSessionElapsedMs();
  if (elapsedMs < 1000) return 0;
  return getFacilityCycles() / (elapsedMs / 60_000);
}

// Scoring deltas are configured in prism diopters; convert to steps so the
// per-answer change matches the configured PD on any monitor/distance setup.
function applyPdDelta(pdDelta) {
  return applyDifficultyDelta(
    corePdDeltaToDifficultySteps(
      pdDelta,
      state.monitorWidthIn,
      state.viewDistanceIn,
      getScreenWidthPx(),
      SPLIT_GAIN_PX_PER_STEP
    )
  );
}

function applyDifficultyDelta(deltaSteps) {
  const beforePd = difficultyToPd(state.difficultySteps, state.monitorWidthIn, state.viewDistanceIn);
  const maxDifficultySteps = pdToDifficultySteps(ABSOLUTE_PD_MAX, state.monitorWidthIn, state.viewDistanceIn);
  state.difficultySteps = coreClampDifficultySteps(state.difficultySteps + deltaSteps, maxDifficultySteps);
  state.currentPd = difficultyToPd(state.difficultySteps, state.monitorWidthIn, state.viewDistanceIn);
  state.bestPd = Math.max(state.bestPd, state.currentPd);
  return state.currentPd - beforePd;
}

function pauseSessionForInactivity() {
  if (!state.running) return;

  state.resumeStartsNextRound = state.awaitingNextRound;
  clearPendingNextRound();
  state.running = false;
  state.paused = true;
  state.nowTs = performance.now();
  state.pausedAtTs = state.nowTs;
  stopRoundTicker();

  setStartButtonLabel();
  syncSessionLayoutMode();
  beep(720, 160);
  updateStatus(`Auto-paused after ${formatInactivityDuration()} without input. Press Resume to continue.`, true);
  updateHud();
  renderScene();
}

function pauseSessionByUser(message) {
  if (!state.running) return;

  state.resumeStartsNextRound = state.awaitingNextRound;
  clearPendingNextRound();
  state.running = false;
  state.paused = true;
  state.nowTs = performance.now();
  state.pausedAtTs = state.nowTs;
  stopRoundTicker();

  setStartButtonLabel();
  syncSessionLayoutMode();
  updateStatus(message);
  updateHud();
  renderScene();
}

function resumeSession() {
  if (!state.paused) return;
  const resumeStartsNextRound = state.resumeStartsNextRound;
  clearPendingNextRound();
  state.resumeStartsNextRound = false;

  const now = performance.now();
  // Anchor on the pause moment, not state.nowTs: viewport refreshes and debug
  // hotkeys update nowTs while paused, which would count paused time as elapsed.
  const pausedAt = state.pausedAtTs > 0 ? state.pausedAtTs : state.nowTs;
  state.pausedAtTs = 0;
  const sessionRemainingMs = Math.max(0, state.sessionEndTs - pausedAt);
  if (sessionRemainingMs <= 0) {
    state.running = true;
    state.paused = false;
    state.nowTs = now;
    endSession();
    return;
  }

  state.running = true;
  state.paused = false;
  state.nowTs = now;
  state.sessionEndTs = now + sessionRemainingMs;
  state.lastResponseTs = now;

  setInputsDisabled(true);
  setStartButtonLabel();
  syncSessionLayoutMode();

  if (resumeStartsNextRound) {
    updateStatus("Session resumed. Starting next round.");
    startRound();
    return;
  }

  const roundRemainingMs = Math.max(250, state.roundEndTs - pausedAt);
  state.roundStartTs = now;
  state.roundEndTs = now + roundRemainingMs;
  updateStatus("Session resumed.");
  startRoundTicker();
  updateHud();
  renderScene();
}

async function resumeSessionWithFullscreen() {
  if (!state.paused) return;
  await requestFullscreenOnStart();
  resumeSession();
}

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampInt(value, min, max, fallback) {
  return coreClampInt(value, min, max, fallback);
}

function clampFloat(value, min, max, fallback) {
  return coreClampFloat(value, min, max, fallback);
}

function sanitizePresetFloat(value, min, max, fallback) {
  return coreSanitizePresetFloat(value, min, max, fallback);
}

function sanitizePresetInt(value, min, max, fallback) {
  return coreSanitizePresetInt(value, min, max, fallback);
}

function formatInches(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function normalizeVergenceMode(value) {
  if (VERGENCE_MODE_MAP.has(value)) return value;
  return DEFAULT_VERGENCE_MODE;
}

function normalizeFieldShape(value) {
  if (FIELD_SHAPE_VALUES.includes(value)) return value;
  return DEFAULT_FIELD_SHAPE_VALUE;
}

function normalizeVerticalPolarity(value) {
  if (VERTICAL_POLARITY_VALUES.includes(value)) return value;
  return DEFAULT_VERTICAL_POLARITY;
}

function normalizeVisualPreset(value) {
  if (VISUAL_PRESET_MAP.has(value)) return value;
  return DEFAULT_VISUAL_PRESET_VALUE;
}

function getVergenceModeGroupLabel(modeValue) {
  if (modeValue === "convergence" || modeValue === "divergence") {
    return "Horizontal Basics";
  }
  if (modeValue === "alternate" || modeValue === "random_jump" || modeValue === "facility") {
    return "Horizontal Jump";
  }
  if (modeValue === "vergence_up" || modeValue === "vergence_down") {
    return "Vertical / Doctor Directed";
  }
  return "";
}

function populateVergenceModeInput() {
  const current = normalizeVergenceMode(vergenceModeInput.value);
  vergenceModeInput.replaceChildren();
  const groups = new Map();

  for (const mode of VERGENCE_MODES) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    const groupLabel = getVergenceModeGroupLabel(mode.value);
    if (!groupLabel) {
      vergenceModeInput.append(option);
      continue;
    }

    let group = groups.get(groupLabel);
    if (!group) {
      group = document.createElement("optgroup");
      group.label = groupLabel;
      groups.set(groupLabel, group);
      vergenceModeInput.append(group);
    }
    group.append(option);
  }

  vergenceModeInput.value = current;
  if (vergenceModeInput.value !== current) {
    vergenceModeInput.value = DEFAULT_VERGENCE_MODE;
  }
}

function populateVisualPresetInput() {
  const current = normalizeVisualPreset(visualPresetInput.value);
  visualPresetInput.replaceChildren();

  for (const preset of VISUAL_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.value;
    option.textContent = preset.label;
    visualPresetInput.append(option);
  }

  visualPresetInput.value = current;
  if (visualPresetInput.value !== current) {
    visualPresetInput.value = DEFAULT_VISUAL_PRESET_VALUE;
  }
}

function getVisualPresetTuning(value) {
  const normalized = normalizeVisualPreset(value);
  return VISUAL_PRESET_MAP.get(normalized)?.tuning || FALLBACK_VISUAL_PRESET_TUNING;
}

function normalizeVisualPresetConfig(preset) {
  const value = typeof preset?.value === "string" ? preset.value.trim() : "";
  if (!value) return null;

  const label = typeof preset?.label === "string" && preset.label.trim() ? preset.label : value;
  const source = preset?.tuning && typeof preset.tuning === "object" ? preset.tuning : {};

  let backgroundSplitRatio = sanitizePresetFloat(source.backgroundSplitRatio, 0.05, 0.95, BACKGROUND_SPLIT_RATIO);
  let squareSplitRatio = sanitizePresetFloat(source.squareSplitRatio, 0.05, 0.95, SQUARE_SPLIT_RATIO);
  const ratioTotal = backgroundSplitRatio + squareSplitRatio;
  if (ratioTotal > 0) {
    backgroundSplitRatio /= ratioTotal;
    squareSplitRatio /= ratioTotal;
  } else {
    backgroundSplitRatio = BACKGROUND_SPLIT_RATIO;
    squareSplitRatio = SQUARE_SPLIT_RATIO;
  }

  const targetPopSizePx = sanitizePresetInt(source.targetPopSizePx, 0, 6, TARGET_POP_SIZE_PX);
  const targetPopAlphaScale = sanitizePresetFloat(source.targetPopAlphaScale, 1, 1.35, TARGET_POP_ALPHA_SCALE);
  const dotMediumThreshold = sanitizePresetFloat(source.dotMediumThreshold, 0, 1, DOT_MEDIUM_THRESHOLD);
  const dotLargeThreshold = Math.max(
    dotMediumThreshold,
    sanitizePresetFloat(source.dotLargeThreshold, 0, 1, DOT_LARGE_THRESHOLD)
  );
  const dotSmallSizePx = sanitizePresetInt(source.dotSmallSizePx, 1, 6, DOT_SMALL_SIZE_PX);
  const dotMediumSizePx = Math.max(
    dotSmallSizePx,
    sanitizePresetInt(source.dotMediumSizePx, 1, 6, DOT_MEDIUM_SIZE_PX)
  );
  const dotLargeSizePx = Math.max(
    dotMediumSizePx,
    sanitizePresetInt(source.dotLargeSizePx, 1, 8, DOT_LARGE_SIZE_PX)
  );

  return Object.freeze({
    value,
    label,
    tuning: Object.freeze({
      backgroundSplitRatio,
      squareSplitRatio,
      targetPopSizePx,
      targetPopAlphaScale,
      dotMediumThreshold,
      dotLargeThreshold,
      dotSmallSizePx,
      dotMediumSizePx,
      dotLargeSizePx
    })
  });
}

function resolveRoundVergence(vergenceMode, round, sequenceSeed = 0) {
  return coreResolveRoundVergence(normalizeVergenceMode(vergenceMode), round, sequenceSeed);
}

function getVergenceAxis(roundVergence) {
  return coreGetVergenceAxis(normalizeExerciseKey(roundVergence));
}

function getVerticalPolaritySign() {
  return coreGetVerticalPolaritySign(normalizeVerticalPolarity(state.verticalPolarity));
}

function getVergenceVector(roundVergence) {
  // Vertical modes use symmetric vertical disparity. The polarity is user-selectable so
  // clinical testing can choose whether "up" means red/left up or the opposite.
  return coreGetVergenceVector(normalizeExerciseKey(roundVergence), normalizeVerticalPolarity(state.verticalPolarity));
}

function formatVergenceLabel(mode) {
  const normalized = normalizeVergenceMode(mode);
  return VERGENCE_MODE_MAP.get(normalized)?.label || "Convergence";
}

function formatVisualPresetLabel(value) {
  const normalized = normalizeVisualPreset(value);
  return VISUAL_PRESET_MAP.get(normalized)?.label || "Balanced";
}

function difficultyToPd(difficultySteps, monitorWidthIn, viewDistanceIn) {
  return coreDifficultyToPd(
    difficultySteps,
    monitorWidthIn,
    viewDistanceIn,
    getScreenWidthPx(),
    BASE_TOTAL_SPLIT_PX,
    SPLIT_GAIN_PX_PER_STEP
  );
}

function pdToDifficultySteps(targetPd, monitorWidthIn, viewDistanceIn) {
  return corePdToDifficultySteps(
    targetPd,
    monitorWidthIn,
    viewDistanceIn,
    getScreenWidthPx(),
    SPLIT_GAIN_PX_PER_STEP
  );
}

function splitPxToPd(splitPx, monitorWidthIn, viewDistanceIn) {
  return coreSplitPxToPd(splitPx, monitorWidthIn, viewDistanceIn, getScreenWidthPx());
}

function pdToSplitPx(pd, monitorWidthIn, viewDistanceIn) {
  return corePdToSplitPx(pd, monitorWidthIn, viewDistanceIn, getScreenWidthPx());
}

function getMmPerPixel(monitorWidthIn) {
  return coreGetMmPerPixel(monitorWidthIn, getScreenWidthPx());
}

function getScreenWidthPx() {
  return Math.max(1, window.screen?.width || window.innerWidth || 1920);
}

function getTotalSplitPx(difficultySteps) {
  return coreGetTotalSplitPx(difficultySteps, BASE_TOTAL_SPLIT_PX, SPLIT_GAIN_PX_PER_STEP);
}

function getBackgroundDisparity(difficultySteps) {
  const ratio = state.visualTuning?.backgroundSplitRatio ?? BACKGROUND_SPLIT_RATIO;
  return getTotalSplitPx(difficultySteps) * ratio;
}

function getSquareDisparity(difficultySteps) {
  const ratio = state.visualTuning?.squareSplitRatio ?? SQUARE_SPLIT_RATIO;
  return getTotalSplitPx(difficultySteps) * ratio;
}

function renderScene() {
  const viewport = syncCanvasViewport();
  const w = viewport.cssWidth;
  const h = viewport.cssHeight;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const trainingActive = isTrainingActive();
  const fieldGeometry = getFieldGeometry();
  const roundVergence = getDisplayRoundVergence();
  const vergenceVector = getVergenceVector(roundVergence);

  ctx.clearRect(0, 0, w, h);
  drawBackdrop(ctx, w, h);

  const backgroundDisparity = getBackgroundDisparity(state.difficultySteps);
  const squareDisparity = getSquareDisparity(state.difficultySteps);
  const leftEyeCenter = {
    x: cx - backgroundDisparity * 0.5 * vergenceVector.x,
    y: cy - backgroundDisparity * 0.5 * vergenceVector.y
  };
  const rightEyeCenter = {
    x: cx + backgroundDisparity * 0.5 * vergenceVector.x,
    y: cy + backgroundDisparity * 0.5 * vergenceVector.y
  };
  const squareShift = {
    x: squareDisparity * 0.5 * vergenceVector.x,
    y: squareDisparity * 0.5 * vergenceVector.y
  };

  drawStereoFieldGlow(ctx, leftEyeCenter, rightEyeCenter, fieldGeometry);
  drawRandomDotStereoSquare(
    ctx,
    state.dots,
    leftEyeCenter,
    rightEyeCenter,
    fieldGeometry,
    squareShift,
    trainingActive ? state.targetSide : "up",
    trainingActive
  );
  if (trainingActive) {
    drawSuppressionMarkers(ctx, leftEyeCenter, rightEyeCenter, fieldGeometry.extent);
  }
}

// One marker per eye channel, just above/below the fused center so they sit in
// view without breaking fixation. Anchored to each eye's field center and kept
// at 0.25 * extent, inside the target squares' inner edge at 0.32 * extent, so
// they never overlap an up/down target. If either fades, that eye is
// suppressing and the user reports it with S.
function drawSuppressionMarkers(context, leftEyeCenter, rightEyeCenter, extent) {
  const offset = extent * 0.25;
  const size = 6;
  context.fillStyle = getLeftDotColor();
  context.fillRect(leftEyeCenter.x - size / 2, leftEyeCenter.y - offset - size / 2, size, size);
  context.fillStyle = getRightDotColor();
  context.fillRect(rightEyeCenter.x - size / 2, rightEyeCenter.y + offset - size / 2, size, size);
}

function drawStereoFieldGlow(context, leftEyeCenter, rightEyeCenter, fieldGeometry) {
  const extent = fieldGeometry.extent * 1.02;
  context.fillStyle = "rgba(255, 64, 64, 0.09)";
  if (fieldGeometry.shape === "square") {
    context.fillRect(leftEyeCenter.x - extent, leftEyeCenter.y - extent, extent * 2, extent * 2);
  } else {
    context.beginPath();
    context.arc(leftEyeCenter.x, leftEyeCenter.y, extent, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(60, 184, 255, 0.09)";
  if (fieldGeometry.shape === "square") {
    context.fillRect(rightEyeCenter.x - extent, rightEyeCenter.y - extent, extent * 2, extent * 2);
  } else {
    context.beginPath();
    context.arc(rightEyeCenter.x, rightEyeCenter.y, extent, 0, Math.PI * 2);
    context.fill();
  }
}

function drawRandomDotStereoSquare(
  context,
  dots,
  leftEyeCenter,
  rightEyeCenter,
  fieldGeometry,
  squareShift,
  side,
  showSquare = true
) {
  const fieldExtent = fieldGeometry.extent;
  const squareOffset = fieldExtent * TARGET_OFFSET_RATIO;
  const squareHalf = fieldExtent * TARGET_HALF_SIZE_RATIO;
  const targetPopSizePx = Math.max(0, Math.round(state.visualTuning?.targetPopSizePx ?? TARGET_POP_SIZE_PX));
  const targetPopAlphaScale = Math.max(1, state.visualTuning?.targetPopAlphaScale ?? TARGET_POP_ALPHA_SCALE);
  const center = getSideCenter(side, squareOffset);
  const rawShiftPerEyeX = showSquare ? squareShift.x : 0;
  const rawShiftPerEyeY = showSquare ? squareShift.y : 0;
  // Clamp with the worst-case target offset on both axes so the target's
  // disparity saturates at the same value on every side; a per-side clamp
  // would make left/right targets pop less than up/down ones at the same
  // difficulty, biasing responses toward the stronger sides.
  const maxShiftPerEye = Math.max(0, fieldExtent - (squareOffset + squareHalf + TARGET_EDGE_PADDING_PX));
  const shiftPerEyeX = Math.sign(rawShiftPerEyeX) * Math.min(Math.abs(rawShiftPerEyeX), maxShiftPerEye);
  const shiftPerEyeY = Math.sign(rawShiftPerEyeY) * Math.min(Math.abs(rawShiftPerEyeY), maxShiftPerEye);
  const leftDotColor = getLeftDotColor();
  const rightDotColor = getRightDotColor();

  for (let i = 0; i < dots.length; i += 1) {
    const dot = dots[i];
    const insideField = isInsideField(dot.x, dot.y, fieldGeometry);
    if (!insideField) continue;

    const insideSquare =
      showSquare &&
      Math.abs(dot.x - center.x) <= squareHalf &&
      Math.abs(dot.y - center.y) <= squareHalf;

    let lx = leftEyeCenter.x + dot.x;
    let ly = leftEyeCenter.y + dot.y;
    let rx = rightEyeCenter.x + dot.x;
    let ry = rightEyeCenter.y + dot.y;
    if (insideSquare) {
      const localX = dot.x - center.x;
      const localY = dot.y - center.y;
      const leftLocalX = shiftPerEyeX === 0 ? localX : wrapInsideSquare(localX - shiftPerEyeX, squareHalf);
      const rightLocalX = shiftPerEyeX === 0 ? localX : wrapInsideSquare(localX + shiftPerEyeX, squareHalf);
      const leftLocalY = shiftPerEyeY === 0 ? localY : wrapInsideSquare(localY - shiftPerEyeY, squareHalf);
      const rightLocalY = shiftPerEyeY === 0 ? localY : wrapInsideSquare(localY + shiftPerEyeY, squareHalf);
      lx = leftEyeCenter.x + center.x + leftLocalX;
      ly = leftEyeCenter.y + center.y + leftLocalY;
      rx = rightEyeCenter.x + center.x + rightLocalX;
      ry = rightEyeCenter.y + center.y + rightLocalY;
    }
    const size = insideSquare ? dot.r + targetPopSizePx : dot.r;
    // Canvas ignores globalAlpha above 1, so emphasize the target by dimming
    // the surround instead; a scale of 1 keeps every dot at full alpha.
    context.globalAlpha = insideSquare ? 1 : 1 / targetPopAlphaScale;

    context.fillStyle = leftDotColor;
    context.fillRect(lx, ly, size, size);
    context.fillStyle = rightDotColor;
    context.fillRect(rx, ry, size, size);
  }

  context.globalAlpha = 1;
}

function getSideCenter(side, distance) {
  if (side === "up") return { x: 0, y: -distance };
  if (side === "right") return { x: distance, y: 0 };
  if (side === "down") return { x: 0, y: distance };
  return { x: -distance, y: 0 };
}

function wrapInsideSquare(localX, squareHalf) {
  const span = squareHalf * 2;
  if (span <= 0) return localX;
  const normalized = ((localX + squareHalf) % span + span) % span;
  return normalized - squareHalf;
}

function getLeftDotColor() {
  return `rgba(${LEFT_DOT_RGB.r}, ${LEFT_DOT_RGB.g}, ${LEFT_DOT_RGB.b}, ${state.leftDotIntensity})`;
}

function getRightDotColor() {
  return `rgba(${RIGHT_DOT_RGB.r}, ${RIGHT_DOT_RGB.g}, ${RIGHT_DOT_RGB.b}, ${state.rightDotIntensity})`;
}

function getFieldShape() {
  return normalizeFieldShape(state.fieldShape);
}

function normalizeFieldSize(value) {
  if (FIELD_SIZE_VALUES.includes(value)) return value;
  return DEFAULT_FIELD_SIZE_VALUE;
}

function getFieldExtentForSize(fieldSize) {
  const viewport = getCanvasMetrics();
  return coreGetFieldExtent(viewport.cssWidth, viewport.cssHeight, FIELD_SIZE_RATIOS[normalizeFieldSize(fieldSize)]);
}

function getFieldExtent() {
  return getFieldExtentForSize(state.fieldSize);
}

function getCanvasMetrics() {
  return coreGetCanvasMetrics(
    canvas,
    window.devicePixelRatio || 1,
    DEFAULT_CANVAS_WIDTH,
    DEFAULT_CANVAS_HEIGHT
  );
}

function syncCanvasViewport() {
  const metrics = getCanvasMetrics();
  if (canvas.width !== metrics.backingWidth || canvas.height !== metrics.backingHeight) {
    canvas.width = metrics.backingWidth;
    canvas.height = metrics.backingHeight;
  }
  ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return metrics;
}

function getFieldGeometry() {
  return { shape: getFieldShape(), extent: getFieldExtent() };
}

function isInsideField(x, y, fieldGeometry) {
  if (fieldGeometry.shape === "square") {
    return Math.abs(x) <= fieldGeometry.extent && Math.abs(y) <= fieldGeometry.extent;
  }
  return x * x + y * y <= fieldGeometry.extent * fieldGeometry.extent;
}

function drawBackdrop(context, width, height) {
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
}

function buildDotField(count, range, seed, visualTuning = FALLBACK_VISUAL_PRESET_TUNING) {
  const dots = [];
  const rand = createRng(seed);
  const mediumThreshold = Math.min(1, Math.max(0, visualTuning.dotMediumThreshold ?? DOT_MEDIUM_THRESHOLD));
  const largeThreshold = Math.min(1, Math.max(mediumThreshold, visualTuning.dotLargeThreshold ?? DOT_LARGE_THRESHOLD));
  const smallSize = Math.max(1, Math.round(visualTuning.dotSmallSizePx ?? DOT_SMALL_SIZE_PX));
  const mediumSize = Math.max(smallSize, Math.round(visualTuning.dotMediumSizePx ?? DOT_MEDIUM_SIZE_PX));
  const largeSize = Math.max(mediumSize, Math.round(visualTuning.dotLargeSizePx ?? DOT_LARGE_SIZE_PX));

  for (let i = 0; i < count; i += 1) {
    const x = (rand() * 2 - 1) * range;
    const y = (rand() * 2 - 1) * range;
    const sizeRoll = rand();
    let r = smallSize;
    if (sizeRoll > largeThreshold) r = largeSize;
    else if (sizeRoll > mediumThreshold) r = mediumSize;
    dots.push({ x, y, r });
  }

  return dots;
}

function createRng(seed) {
  return coreCreateRng(seed);
}

function updateHud() {
  state.currentPd = difficultyToPd(state.difficultySteps, state.monitorWidthIn, state.viewDistanceIn);
  scoreEl.textContent = formatScoreHudText();
  prismEl.textContent = `${formatPd(state.currentPd)}Δ`;
  goalPdHudEl.textContent = `${formatPd(state.goalPd)}Δ`;
  roundEl.textContent = String(state.round);
  const trainingActive = isTrainingActive();
  const clockNowTs = state.paused && state.pausedAtTs > 0 ? state.pausedAtTs : state.nowTs;

  let roundTimeLeft = state.roundDurationMs;
  if (trainingActive && state.roundEndTs > 0) {
    roundTimeLeft = Math.max(0, state.roundEndTs - clockNowTs);
  }
  timerEl.textContent = `${(roundTimeLeft / 1000).toFixed(1)}s`;

  let sessionLeft = state.sessionDurationMs;
  if (trainingActive && state.sessionEndTs > 0) {
    sessionLeft = Math.max(0, state.sessionEndTs - clockNowTs);
  }
  sessionTimerEl.textContent = formatClock(sessionLeft);
  updateSplitReadouts();
  updateDebugStatus();
}

function formatInactivityDuration() {
  const totalSeconds = Math.round(INACTIVITY_PAUSE_MS / 1000);
  if (totalSeconds < 60 || totalSeconds % 60 !== 0) {
    return `${totalSeconds} seconds`;
  }
  const minutes = totalSeconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPd(pd) {
  return pd.toFixed(1);
}

function requestFullscreenOnStart() {
  if (document.fullscreenElement) return Promise.resolve();

  const target = document.documentElement;
  const request =
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.mozRequestFullScreen ||
    target.msRequestFullscreen;

  if (!request) return Promise.resolve();

  try {
    const result = request.call(target);
    if (result && typeof result.then === "function") {
      return result.catch(() => {});
    }
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

function clearPendingNextRound() {
  if (nextRoundTimeoutId !== null) {
    clearTimeout(nextRoundTimeoutId);
    nextRoundTimeoutId = null;
  }
  state.awaitingNextRound = false;
}

function scheduleNextRoundAfterDelay(callback, delayMs = NEXT_ROUND_DELAY_MS) {
  clearPendingNextRound();
  state.awaitingNextRound = true;
  nextRoundTimeoutId = setTimeout(() => {
    nextRoundTimeoutId = null;
    if (!state.running || !state.awaitingNextRound) return;
    state.awaitingNextRound = false;
    callback();
  }, delayMs);
}

function exitFullscreenIfActive() {
  if (!isFullscreenActive()) return Promise.resolve();

  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;

  if (!exit) return Promise.resolve();

  try {
    const result = exit.call(document);
    if (result && typeof result.then === "function") {
      return result.catch(() => {});
    }
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

function isFullscreenActive() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
  );
}

function onFullscreenChange() {
  const fullscreenNow = isFullscreenActive();
  const exitedFullscreenDuringRun = wasFullscreenActive && !fullscreenNow && state.running;
  wasFullscreenActive = fullscreenNow;

  syncSessionLayoutMode();

  if (exitedFullscreenDuringRun) {
    pauseSessionByUser("Press Resume or P to continue.");
  }
  queueViewportRefresh();
}

function pauseSessionForFocusLoss() {
  if (!state.running) return;
  pauseSessionByUser("Session auto-paused after the app lost focus. Press Resume or P to continue.");
  exitFullscreenIfActive();
}

function onVisibilityChange() {
  if (document.visibilityState !== "hidden") return;
  pauseSessionForFocusLoss();
}

function syncSessionLayoutMode() {
  const trainingActive = isTrainingActive();
  document.body.classList.toggle("debug-mode", DEBUG_MODE);
  document.body.classList.toggle("training-live", trainingActive);
  document.body.classList.toggle("session-active", trainingActive && isFullscreenActive());
  syncPauseCard();
}

function setStartButtonLabel() {
  if (state.running) {
    startBtn.textContent = "Running...";
    startBtn.disabled = true;
    return;
  }

  startBtn.textContent = state.paused ? "Resume" : "Start";
  startBtn.disabled = false;
}

function syncPauseCard() {
  if (!state.paused) {
    pauseCardEl.hidden = true;
    return;
  }

  pauseExerciseNameEl.textContent = EXERCISE_LABEL;
  pauseVergenceModeEl.textContent = formatPauseVergenceLabel();
  pauseLrSplitEl.textContent = formatSplitPx(getCurrentTotalSplitPx(), getDisplayRoundVergence());
  pauseCardEl.hidden = false;
}

function formatPauseVergenceLabel() {
  const configured = normalizeVergenceMode(state.vergenceMode);
  const configuredLabel = formatVergenceLabel(configured);
  if (configured !== "alternate" && configured !== "random_jump" && configured !== "facility") {
    return configuredLabel;
  }

  const roundArg = configured === "facility" ? state.facilityPhase + 1 : state.round || 1;
  const currentRoundLabel = formatVergenceLabel(resolveRoundVergence(configured, roundArg, state.modeSequenceSeed));
  return `${configuredLabel} (current round: ${currentRoundLabel})`;
}

function hideSummaryCard() {
  summaryCardEl.classList.add("hidden");
}

function showSummaryCard(reachedGoal) {
  sumResultEl.textContent = reachedGoal ? "Target Met" : "Target Not Met";
  sumBestPdEl.textContent = `${formatPd(state.bestPd)}Δ`;
  sumGoalPdEl.textContent = `${formatPd(state.goalPd)}Δ`;
  sumScoreEl.textContent = String(state.score);
  sumExerciseScoresEl.textContent = formatExerciseScoresSummaryText();
  sumRangesEl.textContent = formatRangesSummaryText();
  sumFacilityEl.textContent = isFacilityMode()
    ? `${getFacilityCycles()} cycles, ${getFacilityCpm().toFixed(1)} cpm`
    : "-";
  sumRoundsEl.textContent = String(state.round);
  sumDurationEl.textContent = formatClock(state.sessionDurationMs);
  sumCorrectEl.textContent = String(state.correctCount);
  sumWrongEl.textContent = String(state.wrongCount);
  sumTimeoutsEl.textContent = String(state.timeoutCount);
  sumSkipsEl.textContent = String(state.skipCount);
  sumSuppressionsEl.textContent = String(state.suppressionCount);
  summaryCardEl.classList.remove("hidden");
}

function buildSessionHistoryRecord(reachedGoal) {
  const ranges = Object.keys(state.vergenceRanges)
    .map(key => ({ exercise: key, pair: coreGetBestRangePair(state.vergenceRanges, key) }))
    .filter(entry => entry.pair)
    .map(entry => ({ exercise: entry.exercise, breakPd: entry.pair.breakPd, recoveryPd: entry.pair.recoveryPd }));

  return {
    endedAt: new Date().toISOString(),
    mode: normalizeVergenceMode(state.vergenceMode),
    visualPreset: state.visualPreset,
    fieldSize: normalizeFieldSize(state.fieldSize),
    sessionMinutes: state.sessionDurationMs / 60_000,
    goalPd: state.goalPd,
    bestPd: state.bestPd,
    reachedGoal,
    totalScore: state.score,
    rounds: state.round,
    correct: state.correctCount,
    wrong: state.wrongCount,
    timeouts: state.timeoutCount,
    skips: state.skipCount,
    suppressions: state.suppressionCount,
    ranges,
    facility: isFacilityMode() ? { cycles: getFacilityCycles(), cpm: getFacilityCpm() } : null
  };
}

function readSessionHistory() {
  try {
    const raw = window.localStorage?.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

function appendSessionHistoryRecord(record) {
  try {
    const history = readSessionHistory();
    history.push(record);
    const trimmed = history.slice(-Math.max(1, HISTORY_MAX_ENTRIES));
    window.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors (privacy mode, quota, blocked storage).
  }
}

function clearSessionHistoryWithConfirm() {
  const history = readSessionHistory();
  if (history.length === 0) return;
  if (!window.confirm(`Delete all ${history.length} recorded sessions? This cannot be undone.`)) return;
  try {
    window.localStorage?.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
  renderSessionHistory();
}

function getRecordBestRange(record) {
  const ranges = Array.isArray(record.ranges) ? record.ranges : [];
  return ranges.reduce(
    (best, entry) => (Number.isFinite(entry?.breakPd) && (!best || entry.breakPd > best.breakPd) ? entry : best),
    null
  );
}

function formatHistoryDate(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function renderSessionHistory() {
  const history = readSessionHistory();
  const recent = history.slice(-10).reverse();

  historyEmptyEl.hidden = recent.length > 0;
  historyTableEl.hidden = recent.length === 0;
  historyExportJsonBtn.disabled = history.length === 0;
  historyExportCsvBtn.disabled = history.length === 0;
  historyClearBtn.disabled = history.length === 0;
  historyTableBodyEl.replaceChildren();

  for (const record of recent) {
    const row = document.createElement("tr");
    const bestRange = getRecordBestRange(record);
    const cells = [
      formatHistoryDate(record.endedAt),
      formatVergenceLabel(record.mode),
      Number.isFinite(record.bestPd) ? `${formatPd(record.bestPd)}Δ` : "-",
      bestRange ? `${formatPd(bestRange.breakPd)}/${formatPd(bestRange.recoveryPd)}Δ` : "-",
      String(record.totalScore ?? "-"),
      String(record.rounds ?? "-"),
      String(record.suppressions ?? 0)
    ];
    for (const text of cells) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    historyTableBodyEl.append(row);
  }

  renderSessionTrend();
}

function getTrendData() {
  return readSessionHistory()
    .slice(-TREND_MAX_SESSIONS)
    .map(record => {
      const bestRange = getRecordBestRange(record);
      return {
        endedAt: record.endedAt,
        bestPd: Number.isFinite(record.bestPd) ? record.bestPd : null,
        breakPd: bestRange ? bestRange.breakPd : null
      };
    });
}

function pickTrendTickStep(maxValue) {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) {
    if (maxValue / step <= 5) return step;
  }
  return 200;
}

function renderSessionTrend(hoverIndex = null) {
  const data = getTrendData();
  if (data.length < 2) {
    historyTrendWrapEl.hidden = true;
    trendModel = null;
    return;
  }
  historyTrendWrapEl.hidden = false;

  const cssWidth = historyTrendEl.clientWidth;
  const cssHeight = 160;
  if (cssWidth <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (historyTrendEl.width !== Math.round(cssWidth * dpr) || historyTrendEl.height !== Math.round(cssHeight * dpr)) {
    historyTrendEl.width = Math.round(cssWidth * dpr);
    historyTrendEl.height = Math.round(cssHeight * dpr);
  }
  const trendCtx = historyTrendEl.getContext("2d");
  if (!trendCtx) return;
  trendCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  trendCtx.clearRect(0, 0, cssWidth, cssHeight);

  const plotLeft = TREND_MARGIN.left;
  const plotRight = cssWidth - TREND_MARGIN.right;
  const plotTop = TREND_MARGIN.top;
  const plotBottom = cssHeight - TREND_MARGIN.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const values = data.flatMap(point => [point.bestPd, point.breakPd]).filter(Number.isFinite);
  const rawMax = Math.max(5, ...values);
  const tickStep = pickTrendTickStep(rawMax);
  const yMax = Math.ceil(rawMax / tickStep) * tickStep;
  const xFor = index => plotLeft + (data.length === 1 ? 0 : (index / (data.length - 1)) * plotWidth);
  const yFor = value => plotBottom - (value / yMax) * plotHeight;

  trendCtx.strokeStyle = "#242424";
  trendCtx.fillStyle = "#8d8d8d";
  trendCtx.lineWidth = 1;
  trendCtx.font = "10px system-ui, sans-serif";
  trendCtx.textAlign = "right";
  trendCtx.textBaseline = "middle";
  for (let tick = 0; tick <= yMax; tick += tickStep) {
    const y = yFor(tick);
    trendCtx.beginPath();
    trendCtx.moveTo(plotLeft, y);
    trendCtx.lineTo(plotRight, y);
    trendCtx.stroke();
    trendCtx.fillText(`${tick}Δ`, plotLeft - 6, y);
  }

  trendCtx.textBaseline = "top";
  trendCtx.textAlign = "left";
  trendCtx.fillText(formatHistoryDate(data[0].endedAt).split(",")[0], plotLeft, plotBottom + 6);
  trendCtx.textAlign = "right";
  trendCtx.fillText(formatHistoryDate(data[data.length - 1].endedAt).split(",")[0], plotRight, plotBottom + 6);

  if (hoverIndex !== null && data[hoverIndex]) {
    trendCtx.strokeStyle = "#454545";
    trendCtx.beginPath();
    trendCtx.moveTo(xFor(hoverIndex), plotTop);
    trendCtx.lineTo(xFor(hoverIndex), plotBottom);
    trendCtx.stroke();
  }

  const drawPoints = data.length <= 40;
  for (const series of TREND_SERIES) {
    trendCtx.strokeStyle = series.color;
    trendCtx.lineWidth = 2;
    trendCtx.beginPath();
    let segmentOpen = false;
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i][series.key];
      if (!Number.isFinite(value)) {
        segmentOpen = false;
        continue;
      }
      if (segmentOpen) {
        trendCtx.lineTo(xFor(i), yFor(value));
      } else {
        trendCtx.moveTo(xFor(i), yFor(value));
        segmentOpen = true;
      }
    }
    trendCtx.stroke();

    if (drawPoints || hoverIndex !== null) {
      for (let i = 0; i < data.length; i += 1) {
        const value = data[i][series.key];
        if (!Number.isFinite(value)) continue;
        if (!drawPoints && i !== hoverIndex) continue;
        const highlighted = i === hoverIndex;
        trendCtx.beginPath();
        trendCtx.arc(xFor(i), yFor(value), highlighted ? 4.5 : 3, 0, Math.PI * 2);
        trendCtx.fillStyle = series.color;
        trendCtx.fill();
        trendCtx.strokeStyle = "#121212";
        trendCtx.lineWidth = 2;
        trendCtx.stroke();
      }
    }
  }

  trendModel = { data, xFor, plotLeft, plotRight };
}

function onTrendHover(event) {
  if (!trendModel || trendModel.data.length === 0) return;
  const rect = historyTrendEl.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { data, xFor, plotLeft, plotRight } = trendModel;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < data.length; i += 1) {
    const distance = Math.abs(xFor(i) - x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  renderSessionTrend(nearestIndex);

  const point = data[nearestIndex];
  historyTrendTooltipEl.replaceChildren();
  const lines = [formatHistoryDate(point.endedAt)];
  if (Number.isFinite(point.bestPd)) lines.push(`Best PD: ${formatPd(point.bestPd)}Δ`);
  if (Number.isFinite(point.breakPd)) lines.push(`Break: ${formatPd(point.breakPd)}Δ`);
  for (const text of lines) {
    const line = document.createElement("div");
    line.textContent = text;
    historyTrendTooltipEl.append(line);
  }
  historyTrendTooltipEl.hidden = false;
  const tooltipWidth = historyTrendTooltipEl.offsetWidth || 120;
  const anchorX = xFor(nearestIndex);
  const flip = anchorX + 12 + tooltipWidth > plotRight;
  historyTrendTooltipEl.style.left = `${flip ? Math.max(plotLeft, anchorX - 12 - tooltipWidth) : anchorX + 12}px`;
}

function onTrendHoverEnd() {
  historyTrendTooltipEl.hidden = true;
  renderSessionTrend();
}

function downloadTextFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportSessionHistoryJson() {
  const history = readSessionHistory();
  if (history.length === 0) return;
  downloadTextFile("vergence-trainer-history.json", "application/json", JSON.stringify(history, null, 2));
}

function exportSessionHistoryCsv() {
  const history = readSessionHistory();
  if (history.length === 0) return;

  const header = [
    "endedAt", "mode", "visualPreset", "fieldSize", "sessionMinutes", "goalPd", "bestPd", "reachedGoal",
    "totalScore", "rounds", "correct", "wrong", "timeouts", "skips", "suppressions",
    "bestBreakPd", "bestRecoveryPd", "facilityCycles", "facilityCpm"
  ];
  const lines = [header.join(",")];
  for (const record of history) {
    const bestRange = getRecordBestRange(record);
    lines.push([
      record.endedAt ?? "",
      record.mode ?? "",
      record.visualPreset ?? "",
      record.fieldSize ?? "",
      record.sessionMinutes ?? "",
      record.goalPd ?? "",
      record.bestPd ?? "",
      record.reachedGoal ?? "",
      record.totalScore ?? "",
      record.rounds ?? "",
      record.correct ?? "",
      record.wrong ?? "",
      record.timeouts ?? "",
      record.skips ?? "",
      record.suppressions ?? "",
      bestRange ? bestRange.breakPd : "",
      bestRange ? bestRange.recoveryPd : "",
      record.facility?.cycles ?? "",
      record.facility?.cpm ?? ""
    ].join(","));
  }
  downloadTextFile("vergence-trainer-history.csv", "text/csv", lines.join("\n"));
}

function updateStatus(text, danger = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("danger", danger);
}

function setRoundDebugState(eventName, inputSide, targetSide, difficultyDeltaPd) {
  state.lastRoundEvent = eventName;
  state.lastInputSide = inputSide;
  state.lastTargetSide = targetSide;
  state.lastDifficultyDeltaPd = difficultyDeltaPd;
}

function updateDebugStatus() {
  if (!debugStatusEl) return;
  if (!DEBUG_MODE) {
    debugStatusEl.hidden = true;
    debugStatusEl.textContent = "";
    return;
  }

  const runState = state.running ? "running" : state.paused ? "paused" : "idle";
  const delta = state.lastDifficultyDeltaPd;
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}Δ`;
  const text = [
    `debug=${runState}`,
    `round=${state.round}`,
    `exercise=${formatExerciseLabel(state.roundVergence)}`,
    `event=${state.lastRoundEvent}`,
    `input=${state.lastInputSide}`,
    `target=${state.lastTargetSide}`,
    `streak=${state.staircaseStreak}/${STAIRCASE_CORRECT_PER_STEP_UP}`,
    `delta=${deltaText}`,
    `scores=${formatScoreHudText()}`,
    `total=${state.score}`,
    `pd=${formatPd(state.currentPd)}Δ`,
    `steps=${state.difficultySteps.toFixed(2)}`
  ].join("  |  ");

  debugStatusEl.hidden = false;
  debugStatusEl.textContent = text;
}

function readUrlFlags() {
  const params = new URLSearchParams(window.location.search);
  return {
    debug: parseBooleanFlag(params.get("debug")),
    clearSettings: parseBooleanFlag(params.get("clearSettings")) || parseBooleanFlag(params.get("reset"))
  };
}

function parseBooleanFlag(value) {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function clearOneShotUrlFlags() {
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const hasOneShot = params.has("clearSettings") || params.has("reset");
    if (!hasOneShot) return;

    params.delete("clearSettings");
    params.delete("reset");

    const search = params.toString();
    const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // Ignore URL rewrite failures in restricted browser contexts.
  }
}

function ensureAudioContext() {
  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    audioCtx = new AudioContextCtor();
  }
}

function beep(freq, durationMs) {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

function playPositiveFeedbackBeep() {
  beep(700, 90);
  setTimeout(() => beep(880, 110), 95);
}

function playNegativeFeedbackBeep() {
  beep(320, 95);
  setTimeout(() => beep(220, 125), 98);
}

function isTrainingActive() {
  return state.running || state.paused;
}

function stopRoundTicker() {
  if (tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}
