// Runtime configuration for the Vergence Trainer. These are the main knobs you
// can safely tune; the README tells the fuller story behind the trickier ones.
window.APP_CONFIG = Object.freeze({
  DEFAULT_ROUND_SECONDS: 20,        // how long you get to answer each round before it times out, unless you change Round Seconds in setup
  MIN_ROUND_SECONDS: 5,             // shortest round length the setup field will accept
  MAX_ROUND_SECONDS: 120,           // longest round length the setup field will accept
  TICK_MS: 100,                     // how often the clocks and the smooth ramp update, in milliseconds; 10 times a second looks smooth without wasting work
  PD_GAIN_PER_CORRECT: 0.75,        // prism diopters demand climbs after a full correct streak; paired with the 1.0 down-step it settles accuracy near 83%
  PD_LOSS_PER_ERROR: 1,             // prism diopters demand drops on any miss; the slightly bigger down-step means relief comes faster than the climb, on purpose
  STAIRCASE_CORRECT_PER_STEP_UP: 3, // correct answers in a row before demand steps up (a 3-down/1-up staircase, the standard way to home in on a threshold)
  FACILITY_BASE_IN_PD: 3,           // the easy base-in (divergence) demand in Facility mode; the 3/12 pair mirrors a clinical prism flipper
  FACILITY_BASE_OUT_PD: 12,         // the hard base-out (convergence) demand in Facility mode, the other half of the 3/12 flipper pair
  SMOOTH_RAMP_PD_PER_SEC: 0.4,      // how fast demand creeps upward in Smooth mode, in prism diopters per second; slow enough to hold fusion and feel it pull
  SMOOTH_BREAK_DROP_PD: 8,          // how far demand falls back when you report a break in Smooth mode, giving room to re-fuse before it climbs again
  CATCH_TRIAL_PROBABILITY: 0.15,    // chance an eligible round is a catch trial with no real target; roughly 1 in 7 catches guessing without being annoying
  VERTICAL_PD_CAP: 8,               // ceiling for the vertical modes, in prism diopters; vertical fusional range is only a few diopters, so demand stays low
  INACTIVITY_PAUSE_MS: 5 * 60_000,  // auto-pause after this long with no input (5 minutes) so walking away does not burn the session clock
  NEXT_ROUND_DELAY_MS: 380,         // gap after a round times out, in milliseconds, before the next stereogram, so the timeout beep and the next round do not blur together (answered rounds advance immediately)
  CONFIG_STORAGE_KEY: "vergence_trainer.config.v1",   // localStorage key your saved settings live under
  HISTORY_STORAGE_KEY: "vergence_trainer.history.v1", // localStorage key your saved session history lives under
  HISTORY_MAX_ENTRIES: 200,         // how many past sessions to keep; older ones are dropped so storage cannot grow forever

  DEFAULT_MONITOR_WIDTH_IN: 24,     // fallback monitor width in inches; you are still asked to measure and confirm your real width before starting
  DEFAULT_VIEW_DISTANCE_IN: 16,     // default eye-to-screen distance in inches (about 40 cm, a typical near working distance)
  DEFAULT_START_PD: 0,              // demand every session starts at (only debug builds let you override this)
  DEFAULT_GOAL_PD: 30,              // default session target in prism diopters; a solid convergence goal, auto-capped lower for modes the eyes cannot reach that far
  DEFAULT_SESSION_MINUTES: 7,       // default session length in minutes: enough for a real workout, short enough to come back to daily
  DEFAULT_FIELD_SHAPE: "circle",    // default outline of the dot field
  DEFAULT_VISUAL_PRESET: "balanced",// default look of the dots (see VISUAL_PRESETS below)

  ABSOLUTE_PD_MAX: 500,             // hard safety ceiling on any demand or goal, in prism diopters; far beyond anything real, just to reject absurd or corrupt values
  ABSOLUTE_SESSION_MINUTES_MAX: 30, // hard ceiling on session length in minutes
  MIN_MONITOR_WIDTH_IN: 10,         // smallest monitor width the setup field accepts, in inches
  MAX_MONITOR_WIDTH_IN: 60,         // largest monitor width the setup field accepts, in inches
  MIN_VIEW_DISTANCE_IN: 8,          // closest view distance the setup field accepts, in inches
  MAX_VIEW_DISTANCE_IN: 60,         // farthest view distance the setup field accepts, in inches

  BASE_TOTAL_SPLIT_PX: 0,           // how far apart the two eye images sit at zero difficulty, in screen pixels; 0 means they coincide, the same zero a prism bar uses, and any other value is a real starting demand reported as such
  SPLIT_GAIN_PX_PER_STEP: 7,        // extra pixels of separation added per difficulty step; this is what turns one step of demand into on-screen disparity
  TARGET_SPLIT_PX: 12,              // fixed disparity of the floating target square, in pixels; it never changes, so the square stays equally findable at any demand

  INITIAL_DOT_COUNT: 5000,          // dots in the idle preview before a session starts; fewer, since nothing is being tested yet
  ROUND_DOT_COUNT: 8200,            // dots during a live round; dense enough to bury the target in noise so only fusion reveals it

  LEFT_DOT_COLOR: "rgba(255, 70, 70, 0.9)",   // red channel, seen through the red lens; alpha 0.9 sits just under full so dots stay crisp without glare
  RIGHT_DOT_COLOR: "rgba(58, 197, 255, 0.9)", // cyan channel, seen through the cyan lens; same near-full alpha as the red channel

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

  // Each preset is the same set of dot-field knobs tuned for a different look.
  // The dot size thresholds are cut points on a 0..1 random roll made per dot:
  // a roll above dotMediumThreshold makes a medium dot, above dotLargeThreshold
  // a large one, otherwise small. So a lower threshold means more big dots.
  VISUAL_PRESETS: [
    {
      value: "balanced",
      label: "Balanced (Default)",
      tuning: {
        targetSplitPx: 12,          // pixels the target square's two eye images are offset; larger floats it more strongly (overrides TARGET_SPLIT_PX for this preset)
        targetPopSizePx: 0,         // extra pixels added to each dot inside the target; 0 means the target is defined by depth alone, not by bigger dots
        targetPopAlphaScale: 1.0,   // how much brighter the target dots are than the surround; 1.0 means no brightness cue, so depth stays the only tell
        dotMediumThreshold: 0.68,   // rolls above this are medium dots, so about 32% of dots are medium or larger
        dotLargeThreshold: 0.96,    // rolls above this are large dots, so about 4% of dots are large, sprinkled among the rest
        dotSmallSizePx: 1,          // pixel size of a small dot (the majority)
        dotMediumSizePx: 2,         // pixel size of a medium dot
        dotLargeSizePx: 3           // pixel size of a large dot
      }
    },
    {
      value: "obvious",
      label: "More Obvious",
      tuning: {
        targetSplitPx: 16,          // wider offset than Balanced, so the target floats harder and is easier to find
        targetPopSizePx: 0,
        targetPopAlphaScale: 1.0,
        dotMediumThreshold: 0.58,   // lower than Balanced, so more medium and large dots: a coarser, easier-to-fuse field
        dotLargeThreshold: 0.9,     // lower than Balanced too, so noticeably more large dots
        dotSmallSizePx: 1,
        dotMediumSizePx: 2,
        dotLargeSizePx: 4           // bigger large dots than Balanced
      }
    },
    {
      value: "fine",
      label: "Fine Dots (Harder)",
      tuning: {
        targetSplitPx: 8,           // narrower offset than Balanced, so the target floats less and is harder to find
        targetPopSizePx: 0,
        targetPopAlphaScale: 1.0,
        dotMediumThreshold: 0.86,   // higher than Balanced, so mostly small dots: a finer, harder-to-fuse field
        dotLargeThreshold: 0.99,    // almost no large dots
        dotSmallSizePx: 1,
        dotMediumSizePx: 1,         // medium collapses to small here, so the field is nearly all 1px dots
        dotLargeSizePx: 2           // even the "large" dots are tiny in this preset
      }
    }
  ]
});
