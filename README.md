# Vergence Trainer Prototype

Browser-based vergence training prototype using red/cyan anaglyph random-dot stereograms.


## Quick Start

- Open `index.html` directly (`file://...`) or host as a static site.
- Files used at runtime: `index.html`, `styles.css`, `config.js`, `vergence-core.js`, `app.js`.

## Testing

- `make verify`
  - Runs the syntax checks and the `node:test` suite together. `node --test`
    alone runs the no-dependency core regression tests in
    `tests/vergence-core.test.js`. Neither needs a browser; `make smoke` is
    the separate browser gate.
- `make smoke`
  - Runs the browser smoke suite headlessly and reports pass/fail. It serves
    the repo, drives the app in a headless Chromium-based browser, scrapes the
    results, and tears the server and all temp files down on the way out,
    including on failure or Ctrl-C. A normal run finishes in a few seconds.
  - Needs a Chromium-based browser. It looks for Google Chrome or Chromium in
    the usual spots; set `CHROME=/path/to/browser` to point it somewhere else.
  - `PORT` sets the local port (default 4173), and `SMOKE_TIMEOUT` is the
    wall-clock ceiling in seconds before it gives up and reports failure
    (default 180).
- `make serve`
  - Starts the local static server on `http://localhost:4173/` and prints the
    smoke harness URL. Use this plus a real browser when you want to watch a
    scenario play out visually.
- `tests/browser-smoke.html`
  - The smoke harness itself. It loads the real app in an iframe and drives
    every vergence mode plus the delicate lifecycle paths: timeout
    transitions, pause/resume, focus loss, reset, and display-context
    changes. It also covers catch trials, the smooth-vergence ramp,
    break/recovery range measurement, and session history import/export
    including recovery from corrupt saved history. The scenario list in
    `tests/browser-smoke.js` is the authoritative inventory.
  - Open `http://localhost:4173/tests/browser-smoke.html` and click
    `Run Smoke Test`, or append `?autorun=1` to start automatically.
  - The harness runs with short test values (`Round Seconds = 5`, `Session
    Minutes = 1`) so the real timers stay visible but the suite finishes
    quickly.
  - Serve it from a local static server; direct `file://` loading is
    intentionally blocked so the test always runs in a supported same-origin
    setup.

## Core Behavior

- Target is disparity-encoded in one of four directions (`up`, `right`, `down`, `left`).
- `Arrow keys` = choose target side.
- `Space` = cannot see target (`-1`, new round).
- Two vigilance dots sit just above and below the fused center, one per eye
  channel, close enough to watch without leaving fixation. If either fades,
  that eye is suppressing: `S` reports it (score unchanged, demand drops, new
  round). Suppression counts appear in the session summary.
- A fraction of rounds (`CATCH_TRIAL_PROBABILITY` in config.js, default 15%)
  are catch trials with no real target. The honest response is `Space`;
  choosing a direction is a false alarm. Catch trials never change the score,
  demand, or ranges, and they only appear in the staircase modes: Facility is
  exempt because dead rounds would deflate its cycles-per-minute, and Smooth is
  exempt because Space already means "it split" there. The summary and export
  report catch count and false alarms (timeouts on catch rounds are counted
  apart, since sitting out the clock says nothing about honesty). Append
  `?catch=<0..1>` to the URL to change the rate for a session (e.g. `?catch=0`
  to turn them off).
- `P` = pause/resume.
- `Esc` exits fullscreen and pauses.
- Leaving the tab/window auto-pauses the session so timing does not keep running in the background.
- Session targets and demand are capped by physiology per mode. Divergence
  caps at what the eyes can geometrically reach: relaxing to parallel cancels
  the baseline convergence to the screen (eye separation over viewing
  distance) plus a small margin beyond, about 21Δ at a 16-inch distance and
  less when sitting farther back. Vertical modes cap at `VERTICAL_PD_CAP`
  (default 8Δ) since vertical fusional range is only a few diopters. The jump
  modes take the divergence cap too: they run one shared demand through both
  directions, and every step up needs a divergence round cleared at that
  demand, so anything above the divergence ceiling could never be reached.
  Convergence keeps the wide generic limit.
- If a session starts without fullscreen (for example the browser blocked the
  request), the session target is lowered at start to what that smaller window
  can render, and the status line says so.
- Scoring: correct = `+1`; wrong / timeout / space = `-1`.
- Demand follows a 3-down/1-up staircase: three consecutive correct answers raise
  demand by `PD_GAIN_PER_CORRECT` (0.75Δ); any error lowers it by
  `PD_LOSS_PER_ERROR` (1Δ). With these steps the demand settles where the user
  answers about 83% of rounds correctly, so the estimate reflects a real
  threshold instead of answer streak luck. The slightly larger down-step is
  deliberate: after a struggle, relief comes faster than the climb.
- `Space` also records a break point at the current demand; the next correct
  answer in the same exercise records the recovery point. The best
  break/recovery pair per exercise appears in the session summary, mirroring
  clinical fusional range measurement. Timeouts do not record breaks since they
  can reflect inattention rather than fusion loss.
- Ranges are only recorded in the single-direction modes (Convergence,
  Divergence, Smooth, and the vertical modes). In the jump modes both
  directions share one demand path, which would contaminate the pairs. While a
  break is pending, further `Space` presses step the demand down without
  costing score: descending to find the recovery point is measurement, not
  failure.
- Scores are tracked per exercise (for example separate convergence/divergence scores in alternating mode).
- HUD score is exercise-scoped; alternating sessions show per-exercise score codes (for example `C:3 D:-1`).
- Session summary is shown at the end.
- Every completed session is appended to a local history
  (`localStorage`, last 200 sessions). The `Session History` panel below the
  app lists recent sessions and offers JSON/CSV export for sharing with a
  doctor, plus a `Clear History` control. A session that ends before a single
  round is answered (for example a display change right after Start) is not
  recorded. Each record also carries the calibration behind its numbers
  (monitor width, view distance, screen pixel width, device pixel ratio,
  round seconds, and the catch-trial rate), so exports can be sanity-checked
  and compared across devices.
- `Import JSON` reads a file made by `Export JSON` and merges it into the
  stored history, keyed on each session's timestamp so re-importing or
  combining two devices never creates duplicates. This is the way to move your
  history to a new browser or machine.

## Session Setup

- `Core Settings`: `Vergence Mode`, `Visual Preset`, `Session Target PD`, `Session Minutes`.
- `Advanced Settings`: `Monitor Width`, `View Distance`, `Round Seconds`, `Field Shape`, `Field Size`, `Red Lens Side`, `Vertical Mode Mapping`, `Red Dot Intensity`, `Cyan Dot Intensity`, a read-only `Eye Split` (marked `RO`), and debug-only `Start PD`.
- `Monitor Width` is a hard requirement before first start.
- Confirm it with browser zoom at 100% (`Cmd/Ctrl+0`). The pixel-to-prism math
  assumes an unzoomed page, and the app cannot detect zoom that was already
  applied when you confirmed.
- Use the `Confirm` / `Reconfirm` control next to `Monitor Width` to acknowledge the current value.
- Once set, monitor width is cached in browser `localStorage` and reused.
- If the app detects a display-context change (for example a move to another monitor, a resolution change, or a browser-zoom change to the device pixel ratio), monitor width must be reconfirmed. If this happens while a session is running or paused, that session ends first, keeping the work already recorded, because the calibration it was training against no longer holds.
- `Field Shape` changes only the outer stereogram field between `Circle` and `Square`.
- `Field Size` shrinks the whole stereogram field (`Large` / `Medium` /
  `Small`). A smaller field gives less peripheral fusion support and is
  harder, like the small-shape option in commercial vergence software.
- `Red Lens Side` asks which eye your glasses' red lens covers, which decides
  the convergence/divergence direction. Like `Monitor Width` it starts unset,
  must be answered before the first session, and is then cached in the
  browser. Self-test: in Convergence mode the fused field should float in
  front of the screen; if it sinks behind, pick the other side.
- `Vertical Mode Mapping` lets you flip the `Vergence Up` / `Vergence Down` polarity if clinical testing suggests the opposite convention.
- `Red Dot Intensity` / `Cyan Dot Intensity` tune anaglyph ghosting for your
  glasses and monitor: with glasses on, close one eye at a time and lower the
  color that faintly shows through the wrong lens until it disappears. Saved
  with the rest of the settings.

## Pause UX

When paused (for example after `Esc`):
- A pause box is shown with `Exercise`, `Vergence`, and `Eye Split`.
- Status text is simplified to: `Press Resume or P to continue.`

## Modes and Presets

- Vergence modes (a one-line description also shows under the mode picker):
  - `Convergence`: eyes turn inward to fuse. Demand rises with correct answers.
  - `Divergence`: eyes relax outward to fuse. Demand rises with correct answers.
  - `Jump Vergence (Alternating)`: switches between convergence and divergence
    every round.
  - `Jump Vergence (Random)`: random mix of convergence and divergence rounds,
    so the direction cannot be anticipated.
  - `Vergence Facility (3Δ / 12Δ)`: jumps between a fixed easy divergence
    demand and a hard convergence demand (`FACILITY_BASE_IN_PD` /
    `FACILITY_BASE_OUT_PD` in config.js). The pair advances only on correct
    answers and demand never drifts. Scored in cycles per minute. Note the
    number is not comparable to prism-flipper norms: a flipper only asks you
    to clear the print, while each phase here requires finding a random-dot
    target and pressing an arrow, which takes extra seconds. Track your own
    trend rather than comparing to published flipper figures.
  - `Smooth Vergence (Ramp)`: convergence demand rises slowly and continuously
    (`SMOOTH_RAMP_PD_PER_SEC` in config.js) while you keep the target fused,
    rather than stepping on each answer. Press `Space` when it splits; the
    demand drops back a margin (`SMOOTH_BREAK_DROP_PD`) so you can re-fuse and
    climb again. Trains smooth (tonic) vergence, the slow-pursuit counterpart
    to the jump modes.
  - `Vergence Up` / `Vergence Down`: vertical demand, where one eye's image
    sits higher or lower than the other. Doctor-directed only.
- Mode labels in this project are generic clinical/task labels rather than references to any outside product naming.
- Visual presets (from `config.js`):
  - `Balanced (Default)`
  - `More Obvious`
  - `Fine Dots (Harder)`
- Outer field shapes: `Circle (Default)`, `Square`.

## URL Flags

- `?debug=1`
  - Shows debug status line and `+/-` debug difficulty controls.
  - Keyboard debug difficulty shortcuts: `[` or `-` / `_` for `-1`; `]` or `=` / `+` for `+1`. Works during fullscreen sessions.
  - Shows debug-only `Start PD` input.
- `?clearSettings=1` or `?reset=1`
  - Clears saved local settings on load.
  - One-shot behavior: flag is removed from the URL after it runs.

## Configuration

- Main user-facing knobs live in `config.js`.
- Low-level rendering defaults live in `app.js` to keep `config.js` smaller.
- Shared pure math/input helpers live in `vergence-core.js`.
- You can still override those low-level defaults by adding matching keys to `window.APP_CONFIG` in `config.js`.

## Notes

- PD displayed here is an estimate based on monitor width, viewing distance, and pixel disparity.
- PD is absolute, on the same scale as a prism bar: 0Δ means the red and cyan
  fields sit exactly on top of each other, and every number counts the whole
  on-screen split. `BASE_TOTAL_SPLIT_PX` in config.js (the split at zero
  difficulty, in pixels) is 0 for that reason; set it higher and the app
  reports that starting split as real demand rather than hiding it. Sessions
  recorded before this change used an 8 px base that was not counted, so
  their values read about 0.6Δ low on a 24-inch monitor at 16 inches.
- The vergence work all lives in the background dot field: as demand rises,
  the red and cyan copies of the field slide further apart. The floating
  target square is different: its red and cyan copies stay a small fixed
  number of screen pixels apart (`targetSplitPx`, set per visual preset).
  That fixed offset is what makes the square float, and because it never
  changes, the square is just as easy to spot at high demand as at low.
- The canvas backing store tracks the rendered canvas size so CSS scaling does not distort the displayed vergence demand.
- `Eye split` is a rendering metric shown as read-only in `Advanced Settings` and in the pause box, tagged with an `H` or `V` for the active axis.
- This project is a prototype, not a medical device.
