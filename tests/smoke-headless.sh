#!/usr/bin/env bash
#
# Runs the browser smoke suite headlessly and reports pass/fail.
#
# It serves the repo, drives tests/browser-smoke.html in a headless
# Chromium-based browser with virtual time (so the real timers fast-forward),
# scrapes the results, and exits non-zero if anything failed or the suite did
# not finish. The static server, the browser, and all temp files are torn down
# by an EXIT trap, so an interrupt or a failure still leaves nothing behind.
#
# The browser is stopped as soon as the results are in rather than waiting for
# it to exit on its own: headless Chrome tends to linger idle after the page
# settles, which would otherwise make every run take the full timeout.
#
# Every blocking stage is bounded so a run always terminates on its own without
# a manual kill: the health check gives up after ~10s (or the moment the server
# dies), the browser poll gives up at SMOKE_TIMEOUT, network calls carry
# --max-time, and the browser teardown escalates to SIGKILL instead of waiting
# on a process that ignores SIGTERM.
#
# Usage: tests/smoke-headless.sh   (or: make smoke)
# Env:   PORT (default 4173), PYTHON (default python3), CHROME (browser path),
#        SMOKE_TIMEOUT (seconds, default 180)

set -euo pipefail

PORT="${PORT:-4173}"
PYTHON="${PYTHON:-python3}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-180}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
server_pid=""
browser_pid=""

cleanup() {
  if [ -n "$browser_pid" ]; then
    kill "$browser_pid" 2>/dev/null || true
  fi
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  # Force-kill anything that ignored SIGTERM so cleanup itself cannot hang.
  sleep 0.3
  [ -n "$browser_pid" ] && kill -9 "$browser_pid" 2>/dev/null || true
  [ -n "$server_pid" ] && kill -9 "$server_pid" 2>/dev/null || true
  rm -rf "$work_dir"
}
trap cleanup EXIT
# On Ctrl-C or a kill, exit cleanly so the EXIT trap tears everything down
# instead of leaving the server or browser running.
trap 'exit 130' INT
trap 'exit 143' TERM

# Refuse to run if something already answers on the port. Otherwise our own
# server would fail to bind, exit, and the health check below would silently
# pass against the foreign server, testing whatever content it happens to serve.
if curl -fsS --max-time 5 -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
  echo "Port ${PORT} is already in use; set PORT to a free port and retry." >&2
  exit 1
fi

find_browser() {
  local candidates=(
    "${CHROME:-}"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "google-chrome"
    "google-chrome-stable"
    "chromium"
    "chromium-browser"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if ! browser="$(find_browser)"; then
  echo "No Chromium-based browser found. Set CHROME=/path/to/chrome and retry." >&2
  exit 2
fi

# exec so $! is the server itself, not the wrapping subshell, and the trap's
# kill reaches it directly.
( cd "$repo_root" && exec "$PYTHON" -m http.server --bind 127.0.0.1 "$PORT" ) >"$work_dir/server.log" 2>&1 &
server_pid=$!

health_url="http://localhost:${PORT}/tests/browser-smoke.html"
tries=0
until curl -fsS --max-time 5 -o /dev/null "$health_url" 2>/dev/null; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Static server exited before it came up on port ${PORT}." >&2
    cat "$work_dir/server.log" >&2 || true
    exit 1
  fi
  tries=$((tries + 1))
  if [ "$tries" -ge 50 ]; then
    echo "Static server did not come up on port ${PORT}." >&2
    cat "$work_dir/server.log" >&2 || true
    exit 1
  fi
  sleep 0.2
done

dom="$work_dir/dom.html"
: >"$dom"
# Chrome cannot start its process sandbox as root (CI containers); nowhere else is dropping it justified.
browser_flags=()
if [ "$(id -u)" = "0" ]; then
  browser_flags+=(--no-sandbox)
fi
"$browser" \
  "${browser_flags[@]}" \
  --headless=new \
  --disable-gpu \
  --virtual-time-budget=300000 \
  --user-data-dir="$work_dir/profile" \
  --dump-dom "${health_url}?autorun=1" >"$dom" 2>/dev/null &
browser_pid=$!

# --dump-dom writes the page once it settles, then Chrome may sit idle. Poll for
# the outcome and stop it the moment the results land, with a wall-clock backstop.
deadline=$(( $(date +%s) + SMOKE_TIMEOUT ))
while kill -0 "$browser_pid" 2>/dev/null; do
  if grep -q "Smoke suite completed" "$dom" 2>/dev/null || grep -q 'class="fail"' "$dom" 2>/dev/null; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Smoke suite did not finish within ${SMOKE_TIMEOUT}s." >&2
    break
  fi
  sleep 0.5
done
kill "$browser_pid" 2>/dev/null || true
# Force-kill if it ignores SIGTERM, so a lingering browser cannot block the
# wait below and wedge the run.
kill_wait=0
while kill -0 "$browser_pid" 2>/dev/null; do
  kill_wait=$((kill_wait + 1))
  if [ "$kill_wait" -ge 15 ]; then
    kill -9 "$browser_pid" 2>/dev/null || true
    break
  fi
  sleep 0.2
done
wait "$browser_pid" 2>/dev/null || true
browser_pid=""

count() {
  { grep -oE "$1" "$dom" 2>/dev/null || true; } | wc -l | tr -d ' '
}

pass_count="$(count '<li class="pass">')"
fail_count="$(count '<li class="fail">')"
completed="$(count 'Smoke suite completed')"

if [ "$fail_count" != "0" ]; then
  { grep -oE '<li class="fail">[^<]*' "$dom" || true; } | sed -E 's/<li class="fail">/FAIL  /'
fi

if [ "$fail_count" != "0" ] || [ "$completed" = "0" ]; then
  echo "SMOKE FAILED (${pass_count} passed, ${fail_count} failed, completed=${completed})" >&2
  exit 1
fi

echo "SMOKE PASSED (${pass_count} checks)"
