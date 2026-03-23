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
- `P` = pause/resume.
- `Esc` exits fullscreen and pauses.
- Leaving the tab/window auto-pauses the session so timing does not keep running in the background.
- Scoring: correct = `+1`; wrong / timeout / space = `-1`.
- Scores are tracked per exercise (for example separate convergence/divergence scores in alternating mode).
- HUD score is exercise-scoped; alternating sessions show per-exercise score codes (for example `C:3 D:-1`).
- Session summary is shown at the end.

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

- Vergence modes: `Convergence`, `Divergence`, `Jump Vergence (Alternating)`, `Jump Vergence (Random)`, `Vergence Up`, `Vergence Down`.
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
