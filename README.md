# Vergence Trainer Prototype

Browser-based vergence training prototype using red/cyan anaglyph random-dot stereograms.


## Quick Start

- Open `index.html` directly (`file://...`) or host as a static site.
- Files used at runtime: `index.html`, `styles.css`, `config.js`, `vergence-core.js`, `app.js`.

## Testing

- `node --test`
  - Runs the no-dependency core regression tests in `tests/vergence-core.test.js`.
- `python3 -m http.server 4173`
  - Serves the repo locally so the browser smoke harness can load the app over `http://localhost` instead of `file://`.
  - Open `http://localhost:4173/tests/browser-smoke.html` and click `Run Smoke Test`.
  - Append `?autorun=1` to start the suite automatically (useful for headless runs).
- `tests/browser-smoke.html`
  - Opens a browser smoke harness that loads the real app and verifies all vergence modes, both field shapes, vertical polarity persistence, debug hotkeys, arrow-key response, timeout transition locking, timeout-transition pause/resume behavior, reset during timeout transition, focus-loss auto-pause, and pause/resume behavior.
  - The harness runs with short test values (`Round Seconds = 5`, `Session Minutes = 1`) so the real timers stay visible but the suite finishes quickly.
  - Use a local static server for the smoke harness; direct `file://` loading is intentionally blocked so the test always runs in a supported same-origin setup.
- `make verify`
  - Runs the syntax checks and the `node:test` suite together.
- `make serve`
  - Starts the local static server on `http://localhost:4173/` and prints the smoke harness URL.

## Core Behavior

- Target is disparity-encoded in one of four directions (`up`, `right`, `down`, `left`).
- `Arrow keys` = choose target side.
- `Space` = cannot see target (`-1`, new round).
- Two vigilance dots sit above and below the field, one per eye channel. If
  either fades, that eye is suppressing: `S` reports it (score unchanged,
  demand drops, new round). Suppression counts appear in the session summary.
- `P` = pause/resume.
- `Esc` exits fullscreen and pauses.
- Leaving the tab/window auto-pauses the session so timing does not keep running in the background.
- Scoring: correct = `+1`; wrong / timeout / space = `-1`.
- Demand follows a 3-down/1-up staircase: three consecutive correct answers raise
  demand by `PD_GAIN_PER_CORRECT`; any error lowers it by `PD_LOSS_PER_ERROR`.
  This converges near 79% accuracy, so the demand estimate reflects a real
  threshold instead of answer streak luck.
- `Space` also records a break point at the current demand; the next correct
  answer in the same exercise records the recovery point. The best
  break/recovery pair per exercise appears in the session summary, mirroring
  clinical fusional range measurement. Timeouts do not record breaks since they
  can reflect inattention rather than fusion loss.
- Scores are tracked per exercise (for example separate convergence/divergence scores in alternating mode).
- HUD score is exercise-scoped; alternating sessions show per-exercise score codes (for example `C:3 D:-1`).
- Session summary is shown at the end.
- Every completed session is appended to a local history
  (`localStorage`, last 200 sessions). The `Session History` panel below the
  app lists recent sessions and offers JSON/CSV export for sharing with a
  doctor, plus a `Clear History` control.

## Session Setup

- `Core Settings`: `Vergence Mode`, `Visual Preset`, `Session Target PD`, `Session Minutes`.
- `Advanced Settings`: `Monitor Width`, `View Distance`, `Round Seconds`, `Field Shape`, `Vertical Mode Mapping`, a read-only `Eye Split` (marked `RO`), and debug-only `Start PD`.
- `Monitor Width` is a hard requirement before first start.
- Use the `Confirm` / `Reconfirm` control next to `Monitor Width` to acknowledge the current value.
- Once set, monitor width is cached in browser `localStorage` and reused.
- If the app detects a display-context change (for example monitor resolution or device pixel ratio), monitor width must be reconfirmed before starting again.
- `Field Shape` changes only the outer stereogram field between `Circle` and `Square`.
- `Vertical Mode Mapping` lets you flip the `Vergence Up` / `Vergence Down` polarity if clinical testing suggests the opposite convention.

## Pause UX

When paused (for example after `Esc`):
- A pause box is shown with `Exercise`, `Vergence`, and `Eye Split`.
- Status text is simplified to: `Press Resume or P to continue.`

## Modes and Presets

- Vergence modes: `Convergence`, `Divergence`, `Jump Vergence (Alternating)`, `Jump Vergence (Random)`, `Vergence Facility (3Δ / 12Δ)`, `Vergence Up`, `Vergence Down`.
- Facility mode alternates a fixed base-in/base-out demand pair
  (`FACILITY_BASE_IN_PD` / `FACILITY_BASE_OUT_PD`, default 3Δ/12Δ). The pair
  advances only on correct answers, demand never drifts, and the session
  summary reports completed cycles and cycles per minute, matching the
  clinical vergence facility test.
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
- The canvas backing store now tracks the rendered canvas size so the displayed vergence demand is not distorted by CSS scaling.
- `Eye split` is a rendering metric shown as read-only in `Advanced Settings` and in the pause box; it now includes an `H` or `V` axis tag.
- This project is a prototype, not a medical device.
