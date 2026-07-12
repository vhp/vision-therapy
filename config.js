window.APP_CONFIG = Object.freeze({
  DEFAULT_ROUND_SECONDS: 20,
  MIN_ROUND_SECONDS: 5,
  MAX_ROUND_SECONDS: 120,
  TICK_MS: 100,
  PD_GAIN_PER_CORRECT: 0.75,
  PD_LOSS_PER_ERROR: 1,
  STAIRCASE_CORRECT_PER_STEP_UP: 3,
  FACILITY_BASE_IN_PD: 3,
  FACILITY_BASE_OUT_PD: 12,
  SMOOTH_RAMP_PD_PER_SEC: 0.4,
  SMOOTH_BREAK_DROP_PD: 8,
  INACTIVITY_PAUSE_MS: 5 * 60_000,
  NEXT_ROUND_DELAY_MS: 380,
  CONFIG_STORAGE_KEY: "vergence_trainer.config.v1",
  HISTORY_STORAGE_KEY: "vergence_trainer.history.v1",
  HISTORY_MAX_ENTRIES: 200,

  DEFAULT_MONITOR_WIDTH_IN: 24,
  DEFAULT_VIEW_DISTANCE_IN: 16,
  DEFAULT_START_PD: 0,
  DEFAULT_GOAL_PD: 30,
  DEFAULT_SESSION_MINUTES: 7,
  DEFAULT_FIELD_SHAPE: "circle",
  DEFAULT_VISUAL_PRESET: "balanced",

  ABSOLUTE_PD_MAX: 500,
  ABSOLUTE_SESSION_MINUTES_MAX: 30,
  MIN_MONITOR_WIDTH_IN: 10,
  MAX_MONITOR_WIDTH_IN: 60,
  MIN_VIEW_DISTANCE_IN: 8,
  MAX_VIEW_DISTANCE_IN: 60,

  BASE_TOTAL_SPLIT_PX: 8,
  SPLIT_GAIN_PX_PER_STEP: 7,
  TARGET_SPLIT_PX: 12,

  INITIAL_DOT_COUNT: 5000,
  ROUND_DOT_COUNT: 8200,

  LEFT_DOT_COLOR: "rgba(255, 70, 70, 0.9)",
  RIGHT_DOT_COLOR: "rgba(58, 197, 255, 0.9)",

  VERGENCE_MODES: [
    { value: "convergence", label: "Convergence" },
    { value: "divergence", label: "Divergence" },
    { value: "alternate", label: "Jump Vergence (Alternating)" },
    { value: "random_jump", label: "Jump Vergence (Random)" },
    { value: "facility", label: "Vergence Facility (3Δ / 12Δ)" },
    { value: "smooth", label: "Smooth Vergence (Ramp)" },
    { value: "vergence_up", label: "Vergence Up" },
    { value: "vergence_down", label: "Vergence Down" }
  ],

  VISUAL_PRESETS: [
    {
      value: "balanced",
      label: "Balanced (Default)",
      tuning: {
        targetSplitPx: 12,
        targetPopSizePx: 0,
        targetPopAlphaScale: 1.0,
        dotMediumThreshold: 0.68,
        dotLargeThreshold: 0.96,
        dotSmallSizePx: 1,
        dotMediumSizePx: 2,
        dotLargeSizePx: 3
      }
    },
    {
      value: "obvious",
      label: "More Obvious",
      tuning: {
        targetSplitPx: 16,
        targetPopSizePx: 0,
        targetPopAlphaScale: 1.0,
        dotMediumThreshold: 0.58,
        dotLargeThreshold: 0.9,
        dotSmallSizePx: 1,
        dotMediumSizePx: 2,
        dotLargeSizePx: 4
      }
    },
    {
      value: "fine",
      label: "Fine Dots (Harder)",
      tuning: {
        targetSplitPx: 8,
        targetPopSizePx: 0,
        targetPopAlphaScale: 1.0,
        dotMediumThreshold: 0.86,
        dotLargeThreshold: 0.99,
        dotSmallSizePx: 1,
        dotMediumSizePx: 1,
        dotLargeSizePx: 2
      }
    }
  ]
});
