const runBtn = document.getElementById("runBtn");
const resultsEl = document.getElementById("results");
const appFrame = document.getElementById("appFrame");
const environmentWarningEl = document.getElementById("environmentWarning");
let runInProgress = false;
// Existing scenarios answer with arrows and must never hit a catch trial, so
// they load with catch trials off. The catch scenario raises it to 1.
let catchParamForBoot = "0";
// Almost every boot clears saved settings for a clean slate. The persisted-boot
// check turns this off to prove the app starts from a saved config.
let clearSettingsForBoot = "1";
const STATIC_SERVER_HELP = "Serve the repo from its root with `python3 -m http.server 4173`, then open `http://localhost:4173/tests/browser-smoke.html`.";
const MODE_SCENARIOS = [
  {
    label: "Convergence / Square",
    vergenceMode: "convergence",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifyDebugHotkeys: true,
    verifyPauseResume: true,
    verifyFocusLossPause: true,
    verifyTimeoutGuard: true,
    verifyTimeoutPauseResume: true,
    verifyResizeDuringPause: true,
    verifyRangeDescent: true,
    suppressionDemandText: "Demand reduced"
  },
  {
    label: "Convergence / Reset During Timeout Transition",
    vergenceMode: "convergence",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifyResetDuringTimeoutTransition: true
  },
  {
    label: "Convergence / Resume After Display Change",
    vergenceMode: "convergence",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifyResumeDisplayChange: true
  },
  {
    label: "Convergence / Scoring and Completion",
    vergenceMode: "convergence",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifyScoringAndCompletion: true
  },
  {
    label: "Divergence / Circle",
    vergenceMode: "divergence",
    fieldShape: "circle",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Divergence"],
    expectedNextExercises: ["Divergence"],
    expectedAxis: "H",
    // The default 30 goal must clamp to the physiologic divergence ceiling
    // at the default 16in view distance (about 21).
    expectedGoalText: "session target 21.0Δ"
  },
  {
    label: "Jump Vergence (Alternating)",
    vergenceMode: "alternate",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Divergence"],
    expectedAxis: "H"
  },
  {
    label: "Jump Vergence (Random)",
    vergenceMode: "random_jump",
    fieldShape: "circle",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Convergence", "Divergence"],
    expectedNextExercises: ["Convergence", "Divergence"],
    expectedAxis: "H"
  },
  {
    label: "Vergence Facility",
    vergenceMode: "facility",
    fieldShape: "square",
    verticalPolarity: "standard",
    // Booting with catch=1 proves facility mode ignores catch trials: if one
    // ever fired, the arrow answers below would be swallowed as false alarms.
    catchParam: "1",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Divergence"],
    expectedAxis: "H",
    suppressionDemandText: "Demand held"
  },
  {
    label: "Catch Trials",
    vergenceMode: "convergence",
    fieldShape: "square",
    verticalPolarity: "standard",
    catchParam: "1",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifyCatchTrials: true
  },
  {
    label: "Smooth Vergence (Ramp)",
    vergenceMode: "smooth",
    fieldShape: "square",
    verticalPolarity: "standard",
    // catch=1 proves smooth mode ignores catch trials, keeping Space's
    // break-report meaning intact.
    catchParam: "1",
    expectedInitialExercises: ["Convergence"],
    expectedNextExercises: ["Convergence"],
    expectedAxis: "H",
    verifySmoothRamp: true
  },
  {
    label: "Vergence Up / Square",
    vergenceMode: "vergence_up",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Vergence Up"],
    expectedNextExercises: ["Vergence Up"],
    expectedAxis: "V",
    expectedGoalText: "session target 8.0Δ"
  },
  {
    label: "Vergence Down / Circle / Flipped",
    vergenceMode: "vergence_down",
    fieldShape: "circle",
    verticalPolarity: "flipped",
    expectedInitialExercises: ["Vergence Down"],
    expectedNextExercises: ["Vergence Down"],
    expectedAxis: "V"
  }
];

runBtn.addEventListener("click", () => {
  const environmentIssue = getEnvironmentIssue();
  if (environmentIssue) {
    clearResults();
    recordResult("fail", "Smoke suite blocked", environmentIssue);
    syncEnvironmentGuard();
    return;
  }
  if (runInProgress) return;
  runSmokeSuite().catch(error => {
    recordResult("fail", "Smoke suite failed", error.message);
  }).finally(() => {
    runInProgress = false;
    runBtn.disabled = false;
    appFrame.style.pointerEvents = "";
  });
});

syncEnvironmentGuard();

if (new URLSearchParams(window.location.search).has("autorun") && !getEnvironmentIssue()) {
  runBtn.click();
}

function clearResults() {
  resultsEl.replaceChildren();
}

function recordResult(status, label, detail) {
  const item = document.createElement("li");
  item.className = status;
  item.textContent = detail ? `${label}: ${detail}` : label;
  resultsEl.append(item);
}

function delay(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function getEnvironmentIssue() {
  if (window.location.protocol === "file:") {
    return `This smoke harness must run over http:// or https://, not file://. ${STATIC_SERVER_HELP}`;
  }
  return "";
}

function syncEnvironmentGuard() {
  const environmentIssue = getEnvironmentIssue();
  if (environmentWarningEl) {
    environmentWarningEl.hidden = !environmentIssue;
    environmentWarningEl.textContent = environmentIssue;
  }
  if (!runInProgress) {
    runBtn.disabled = Boolean(environmentIssue);
  }
}

function dispatchFrameEvent(targetWindow, target, type) {
  const EventCtor = targetWindow.Event || Event;
  const event = new EventCtor(type, {
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
}

async function waitFor(label, predicate, timeoutMs = 5000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await delay(40);
  }
  throw new Error(`${label} timed out`);
}

function getAppFrameUrl() {
  const url = new URL("../index.html", window.location.href);
  url.searchParams.set("debug", "1");
  if (clearSettingsForBoot === "1") {
    url.searchParams.set("clearSettings", "1");
  }
  url.searchParams.set("catch", catchParamForBoot);
  url.searchParams.set("run", String(Date.now()));
  return url.toString();
}

async function loadFrame() {
  const targetUrl = getAppFrameUrl();
  const targetRunId = new URL(targetUrl).searchParams.get("run");
  appFrame.src = targetUrl;
  await waitFor("app frame load", () => {
    try {
      const doc = appFrame.contentWindow?.document;
      if (!doc) return false;
      const locationHref = String(doc.location?.href || "");
      if (!locationHref) return false;
      const loadedUrl = new URL(locationHref, window.location.href);
      if (loadedUrl.pathname !== new URL(targetUrl).pathname) return false;
      if (loadedUrl.searchParams.get("run") !== targetRunId) return false;
      return doc.readyState === "complete" && Boolean(doc.getElementById("startBtn"));
    } catch {
      return false;
    }
  }, 15000);
}

async function unloadFrame() {
  appFrame.src = "about:blank";
  await waitFor("app frame unload", () => {
    try {
      const doc = appFrame.contentWindow?.document;
      if (!doc) return false;
      const locationHref = String(doc.location?.href || "");
      return locationHref === "about:blank";
    } catch {
      return false;
    }
  }, 5000);
}

function parseDebugStatus(text) {
  const result = Object.create(null);
  for (const part of text.split("|")) {
    const [rawKey, rawValue] = part.trim().split("=");
    if (!rawKey || typeof rawValue !== "string") continue;
    result[rawKey] = rawValue;
  }
  return result;
}

function dispatchKey(targetWindow, code, key) {
  const KeyboardEventCtor = targetWindow.KeyboardEvent || KeyboardEvent;
  const event = new KeyboardEventCtor("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    key
  });
  targetWindow.dispatchEvent(event);
}

function installFullscreenStub(frameWindow) {
  const frameDocument = frameWindow.document;
  const requestStub = () => Promise.resolve();
  const exitStub = () => Promise.resolve();

  try {
    Object.defineProperty(frameDocument.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestStub
    });
  } catch {
    frameDocument.documentElement.requestFullscreen = requestStub;
  }

  try {
    Object.defineProperty(frameDocument, "exitFullscreen", {
      configurable: true,
      value: exitStub
    });
  } catch {
    frameDocument.exitFullscreen = exitStub;
  }
}

function getStorageKey(frameWindow) {
  return String(frameWindow.APP_CONFIG?.CONFIG_STORAGE_KEY || "vergence_trainer.config.v1");
}

function readStoredConfig(frameWindow) {
  return JSON.parse(frameWindow.localStorage.getItem(getStorageKey(frameWindow)) || "{}");
}

function getTargetArrow(targetSide) {
  const arrowMap = {
    up: { code: "ArrowUp", key: "ArrowUp" },
    right: { code: "ArrowRight", key: "ArrowRight" },
    down: { code: "ArrowDown", key: "ArrowDown" },
    left: { code: "ArrowLeft", key: "ArrowLeft" }
  };
  return arrowMap[targetSide] || null;
}

function getNonTargetArrow(targetSide) {
  const wrongSide = ["up", "right", "down", "left"].find(side => side !== targetSide) || "up";
  return getTargetArrow(wrongSide);
}

function assertOneOf(actual, expectedValues, label) {
  if (expectedValues.includes(actual)) return;
  throw new Error(`${label}: expected one of [${expectedValues.join(", ")}], got ${actual || "(missing)"}`);
}

const HISTORY_STORAGE_KEY = "vergence_trainer.history.v1";

// Session history lives in the app frame's own localStorage, which persists
// across same-origin reloads of the frame. Clearing it before each boot keeps
// scenarios from inheriting records left by a session that ran to completion.
function clearFrameSessionHistory() {
  try {
    appFrame.contentWindow?.localStorage?.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // No accessible frame yet, or storage blocked; nothing to clear.
  }
}

async function bootFreshApp() {
  clearFrameSessionHistory();
  await loadFrame();

  let frameWindow;
  let frameDocument;
  try {
    frameWindow = appFrame.contentWindow;
    frameDocument = frameWindow.document;
  } catch {
    throw new Error("Cannot access the app frame. Use a local static server if file:// iframe access is blocked.");
  }

  await waitFor("app boot", () => {
    const startBtn = frameDocument.getElementById("startBtn");
    const vergenceModeInput = frameDocument.getElementById("vergenceMode");
    return startBtn && vergenceModeInput && vergenceModeInput.options.length > 0;
  });
  installFullscreenStub(frameWindow);

  return { frameWindow, frameDocument };
}

async function setMonitorWidth(frameWindow, frameDocument, widthIn) {
  const monitorWidthInput = frameDocument.getElementById("monitorWidth");
  const confirmBtn = frameDocument.getElementById("monitorWidthConfirmBtn");
  monitorWidthInput.value = String(widthIn);
  if (confirmBtn && !confirmBtn.hidden) {
    confirmBtn.click();
  } else {
    dispatchFrameEvent(frameWindow, monitorWidthInput, "input");
    dispatchFrameEvent(frameWindow, monitorWidthInput, "change");
  }
  await waitFor("monitor width persistence", () => {
    const storedConfig = readStoredConfig(frameWindow);
    return storedConfig.monitorWidthIn === widthIn && storedConfig.monitorWidthConfirmed === true;
  });
}

async function setSelectValue(frameWindow, frameDocument, id, value, storageKey) {
  const input = frameDocument.getElementById(id);
  input.value = value;
  dispatchFrameEvent(frameWindow, input, "input");
  dispatchFrameEvent(frameWindow, input, "change");
  await waitFor(`${id} persistence`, () => readStoredConfig(frameWindow)[storageKey] === value);
}

async function setNumericValue(frameWindow, frameDocument, id, value, storageKey) {
  const input = frameDocument.getElementById(id);
  input.value = String(value);
  dispatchFrameEvent(frameWindow, input, "input");
  dispatchFrameEvent(frameWindow, input, "change");
  await waitFor(`${id} persistence`, () => {
    const storedValue = readStoredConfig(frameWindow)[storageKey];
    return Number(storedValue) === Number(value);
  });
}

async function waitForReadyState(frameDocument) {
  const statusEl = frameDocument.getElementById("status");
  await waitFor("ready status", () => {
    const text = String(statusEl?.textContent || "");
    return text.startsWith("Ready:");
  });
}

async function startSession(frameDocument) {
  const startBtn = frameDocument.getElementById("startBtn");
  startBtn.click();
  await waitFor("session start", () => Number(frameDocument.getElementById("round").textContent) >= 1);
  const debugStatusEl = frameDocument.getElementById("debugStatus");
  await waitFor("debug status", () => !debugStatusEl.hidden && debugStatusEl.textContent.includes("target="));
  return { startBtn, debugStatusEl };
}

function getCurrentAxis(frameDocument) {
  return String(frameDocument.getElementById("lrSplit")?.value || "");
}

async function answerCurrentRoundCorrectly(frameWindow, frameDocument, debugStatusEl) {
  const currentRound = Number(frameDocument.getElementById("round").textContent);
  const debugState = parseDebugStatus(debugStatusEl.textContent);
  const arrow = getTargetArrow(debugState.target);
  if (!arrow) {
    throw new Error(`Unexpected target side in debug status: ${debugState.target || "(missing)"}`);
  }
  dispatchKey(frameWindow, arrow.code, arrow.key);
  await waitFor("round advance after answer", () => Number(frameDocument.getElementById("round").textContent) > currentRound);
  await waitFor("next round debug status", () => {
    const nextState = parseDebugStatus(debugStatusEl.textContent);
    return Number(nextState.round) > currentRound;
  });
}

async function verifyDebugHotkeys(frameWindow, frameDocument, debugStatusEl) {
  const prismEl = frameDocument.getElementById("prism");
  const prismBeforeDebug = prismEl.textContent;
  dispatchKey(frameWindow, "BracketRight", "]");
  await waitFor("debug hotkey effect", () => {
    return debugStatusEl.textContent.includes("event=debugKey+") && prismEl.textContent !== prismBeforeDebug;
  });
}

async function verifyPauseResume(frameWindow, frameDocument, startBtn) {
  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("pause card", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    return !pauseCard.hidden && startBtn.textContent === "Resume";
  });

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("resume", () => startBtn.disabled === true && startBtn.textContent === "Running...");
}

async function stopScenarioSession(frameDocument) {
  const resetBtn = frameDocument.getElementById("resetBtn");
  const startBtn = frameDocument.getElementById("startBtn");
  const roundEl = frameDocument.getElementById("round");
  const pauseCard = frameDocument.getElementById("pauseCard");
  resetBtn.click();
  await waitFor("scenario reset", () => {
    return startBtn.textContent === "Start" &&
      startBtn.disabled === false &&
      Number(roundEl.textContent) === 0 &&
      pauseCard.hidden === true;
  });
}

async function verifyFocusLossPause(frameWindow, frameDocument, startBtn) {
  const EventCtor = frameWindow.Event || Event;
  frameWindow.dispatchEvent(new EventCtor("blur"));
  await waitFor("focus-loss pause", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    const statusText = String(frameDocument.getElementById("status")?.textContent || "");
    return !pauseCard.hidden && startBtn.textContent === "Resume" && statusText.includes("lost focus");
  });

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("focus-loss resume", () => startBtn.disabled === true && startBtn.textContent === "Running...");
}

async function verifyTimeoutGuard(frameWindow, frameDocument, debugStatusEl) {
  const timedRound = Number(frameDocument.getElementById("round").textContent);
  await waitFor("timeout transition", () => {
    const debugState = parseDebugStatus(debugStatusEl.textContent);
    return Number(debugState.round) === timedRound && debugState.event === "timeout";
  }, 7000);

  const timeoutState = parseDebugStatus(debugStatusEl.textContent);
  const totalBefore = Number(timeoutState.total);
  const arrow = getTargetArrow(timeoutState.target);
  if (!arrow) {
    throw new Error(`Timeout guard missing target side: ${timeoutState.target || "(missing)"}`);
  }

  dispatchKey(frameWindow, arrow.code, arrow.key);
  await delay(120);

  const currentRound = Number(frameDocument.getElementById("round").textContent);
  const afterBlockedInput = parseDebugStatus(debugStatusEl.textContent);
  if (currentRound !== timedRound) {
    throw new Error(`Timeout guard failed: round advanced early from ${timedRound} to ${currentRound}`);
  }
  if (Number(afterBlockedInput.total) !== totalBefore) {
    throw new Error(`Timeout guard failed: total changed from ${totalBefore} to ${afterBlockedInput.total}`);
  }
  if (afterBlockedInput.event !== "timeout") {
    throw new Error(`Timeout guard failed: debug event changed to ${afterBlockedInput.event}`);
  }

  await waitFor("next round after timeout", () => Number(frameDocument.getElementById("round").textContent) > timedRound, 2000);
}

async function verifyPauseDuringTimeoutTransition(frameWindow, frameDocument, debugStatusEl, startBtn) {
  const roundEl = frameDocument.getElementById("round");
  const timedRound = Number(roundEl.textContent);

  await waitFor("timeout transition for pause/resume", () => {
    const debugState = parseDebugStatus(debugStatusEl.textContent);
    return Number(debugState.round) === timedRound && debugState.event === "timeout";
  }, 7000);

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("pause during timeout transition", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    return !pauseCard.hidden && startBtn.textContent === "Resume";
  });

  const pausedRound = Number(roundEl.textContent);
  const pausedDebugState = parseDebugStatus(debugStatusEl.textContent);
  if (pausedRound !== timedRound) {
    throw new Error(`Timeout pause/resume failed: paused on round ${pausedRound} instead of expired round ${timedRound}`);
  }
  if (pausedDebugState.event !== "timeout") {
    throw new Error(`Timeout pause/resume failed: expected timeout event while paused, got ${pausedDebugState.event}`);
  }

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("resume after timeout transition", () => startBtn.disabled === true && startBtn.textContent === "Running...");
  await waitFor("next round after timeout-transition resume", () => Number(roundEl.textContent) > timedRound, 2000);

  const resumedRound = Number(roundEl.textContent);
  const resumedDebugState = parseDebugStatus(debugStatusEl.textContent);
  if (resumedRound !== timedRound + 1) {
    throw new Error(`Timeout pause/resume failed: resumed on round ${resumedRound}, expected ${timedRound + 1}`);
  }
  if (Number(resumedDebugState.round) !== resumedRound) {
    throw new Error(`Timeout pause/resume failed: debug status round ${resumedDebugState.round} does not match visible round ${resumedRound}`);
  }
  if (resumedDebugState.event === "timeout") {
    throw new Error("Timeout pause/resume failed: resumed into the expired timeout state");
  }
}

async function verifyResetDuringTimeoutTransition(frameDocument, debugStatusEl) {
  const roundEl = frameDocument.getElementById("round");
  const resetBtn = frameDocument.getElementById("resetBtn");
  const startBtn = frameDocument.getElementById("startBtn");
  const timedRound = Number(roundEl.textContent);

  await waitFor("timeout transition for reset", () => {
    const debugState = parseDebugStatus(debugStatusEl.textContent);
    return Number(debugState.round) === timedRound && debugState.event === "timeout";
  }, 7000);

  resetBtn.click();
  await waitFor("reset during timeout transition", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    return startBtn.textContent === "Start" &&
      startBtn.disabled === false &&
      Number(roundEl.textContent) === 0 &&
      pauseCard.hidden === true;
  });

  await delay(600);
  if (startBtn.textContent !== "Start" || Number(roundEl.textContent) !== 0) {
    throw new Error("Reset during timeout transition failed: stale next-round callback changed state after reset");
  }
}

function clockToSeconds(text) {
  const match = /^(\d+):(\d+)$/.exec(String(text || "").trim());
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function verifyResizeDuringPause(frameWindow, frameDocument, startBtn) {
  const sessionTimerEl = frameDocument.getElementById("sessionTimer");

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("pause for resize test", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    return !pauseCard.hidden && startBtn.textContent === "Resume";
  });
  const secondsAtPause = clockToSeconds(sessionTimerEl.textContent);

  // Stay paused a real interval, then bump the app's clock the way a stray
  // interaction while paused does: a resize (viewport refresh) and, since this
  // frame runs in debug mode, a debug difficulty key. Both write state.nowTs;
  // the clock and resume math must ignore it and use the pause timestamp.
  await delay(2500);
  const EventCtor = frameWindow.Event || Event;
  frameWindow.dispatchEvent(new EventCtor("resize"));
  if (frameWindow.visualViewport) {
    frameWindow.visualViewport.dispatchEvent(new EventCtor("resize"));
  }
  dispatchKey(frameWindow, "BracketRight", "]");
  await delay(200);

  const secondsWhilePaused = clockToSeconds(sessionTimerEl.textContent);
  if (Math.abs(secondsWhilePaused - secondsAtPause) > 1) {
    throw new Error(`Interaction during pause moved the frozen clock: ${secondsAtPause}s -> ${secondsWhilePaused}s`);
  }

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("resume after pause-interaction test", () =>
    startBtn.disabled === true && startBtn.textContent === "Running...");

  const secondsAfterResume = clockToSeconds(sessionTimerEl.textContent);
  if (secondsAtPause - secondsAfterResume > 1) {
    throw new Error(`Paused time was lost on resume: ${secondsAtPause}s at pause, ${secondsAfterResume}s after resume`);
  }
}

async function verifySmoothRamp(frameDocument) {
  const prismEl = frameDocument.getElementById("prism");
  const readPd = () => Number.parseFloat(String(prismEl.textContent || "").replace(/[^\d.]/g, ""));
  const before = readPd();
  // With no answers at all, the demand must climb on its own from the ramp.
  await waitFor("smooth demand ramps up", () => readPd() > before + 0.3, 5000);
}

async function verifyCatchTrials(frameWindow, frameDocument, debugStatusEl) {
  const roundEl = frameDocument.getElementById("round");
  const initial = parseDebugStatus(debugStatusEl.textContent);
  if (initial.catch !== "yes") {
    throw new Error(`Catch trials: expected every round to be a catch trial, got catch=${initial.catch}`);
  }

  // Choosing a direction with no target present is a false alarm.
  const roundBefore = Number(roundEl.textContent);
  dispatchKey(frameWindow, "ArrowUp", "ArrowUp");
  await waitFor("catch false alarm counted", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return d.catchFA === "1/1" && d.total === "0" && Number(roundEl.textContent) > roundBefore;
  });

  // Pressing Space is the correct rejection: total rises, false alarms do not,
  // and the score stays untouched.
  dispatchKey(frameWindow, "Space", " ");
  await waitFor("catch correct rejection counted", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return d.catchFA === "1/2" && d.total === "0";
  });
}

async function verifyRangeDescent(frameWindow, frameDocument, debugStatusEl) {
  const statusEl = frameDocument.getElementById("status");
  const prismEl = frameDocument.getElementById("prism");
  const readPd = () => Number.parseFloat(String(prismEl.textContent || "").replace(/[^\d.]/g, ""));

  // Raise demand off the zero floor first: a break is only a fusional-range
  // measurement above zero demand, so a Space at the floor is a plain skip.
  // The debug hotkey bumps demand without scoring or advancing the round.
  let guard = 0;
  while (readPd() < 3 && guard < 40) {
    dispatchKey(frameWindow, "BracketRight", "]");
    guard += 1;
  }
  if (readPd() < 3) {
    throw new Error(`Range descent: could not raise demand off the floor, stuck at ${readPd()}Δ`);
  }

  const totalBefore = Number(parseDebugStatus(debugStatusEl.textContent).total);

  // First Space records the break and costs one point like any failure.
  dispatchKey(frameWindow, "Space", " ");
  await waitFor("break recorded", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return Number(d.total) === totalBefore - 1 &&
      String(statusEl.textContent || "").includes("Break recorded");
  });

  // Space presses during the descent must not cost score or count as skips.
  dispatchKey(frameWindow, "Space", " ");
  await waitFor("descent is score-free", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return Number(d.total) === totalBefore - 1 &&
      String(statusEl.textContent || "").includes("Descending");
  });

  // Letting the round time out while the break is still pending is also a
  // score-free descent step, not a scored timeout.
  await waitFor("timeout during descent stays score-free", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return d.event === "rangeDescent" && d.input === "-" && Number(d.total) === totalBefore - 1;
  }, 9000);

  // A correct answer at the lower demand closes the range: the recovery is
  // recorded (the status reports it) and the break stops being pending. The
  // correct answer itself scores +1, returning the total to its pre-break value.
  await waitFor("descent advances to a fresh target", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return d.event === "pending" && Boolean(getTargetArrow(d.target));
  });
  const recoveryState = parseDebugStatus(debugStatusEl.textContent);
  const arrow = getTargetArrow(recoveryState.target);
  dispatchKey(frameWindow, arrow.code, arrow.key);
  await waitFor("recovery closes the range", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return String(statusEl.textContent || "").includes("Recovery at") &&
      Number(d.total) === totalBefore;
  });
}

// Exercises the parts of a live session the other scenarios skip: a wrong
// answer (score -1, demand drops), the 3-down/1-up staircase step-up, and a
// session running to its natural end so the summary card and a history row
// appear.
async function verifyScoringAndCompletion(frameWindow, frameDocument, debugStatusEl, startBtn) {
  const roundEl = frameDocument.getElementById("round");
  const prismEl = frameDocument.getElementById("prism");
  const readPd = () => Number.parseFloat(String(prismEl.textContent || "").replace(/[^\d.]/g, ""));

  // Three correct answers in a row must raise demand once (the step-up).
  const pdBeforeStreak = readPd();
  for (let i = 0; i < 3; i += 1) {
    await answerCurrentRoundCorrectly(frameWindow, frameDocument, debugStatusEl);
  }
  const pdAfterStreak = readPd();
  if (!(pdAfterStreak > pdBeforeStreak)) {
    throw new Error(`Staircase step-up failed: PD did not rise after 3 correct (${pdBeforeStreak} -> ${pdAfterStreak})`);
  }

  // A wrong answer costs one point and steps demand back down.
  const beforeWrong = parseDebugStatus(debugStatusEl.textContent);
  const totalBeforeWrong = Number(beforeWrong.total);
  const pdBeforeWrong = readPd();
  const roundBeforeWrong = Number(roundEl.textContent);
  const wrong = getNonTargetArrow(beforeWrong.target);
  dispatchKey(frameWindow, wrong.code, wrong.key);
  await waitFor("wrong answer advances the round", () => Number(roundEl.textContent) > roundBeforeWrong);
  await waitFor("wrong answer costs a point and drops demand", () => {
    const d = parseDebugStatus(debugStatusEl.textContent);
    return Number(d.total) === totalBeforeWrong - 1 && readPd() < pdBeforeWrong;
  });

  // Let the remaining rounds time out so the session ends on its own, then
  // confirm the summary card and a new history row appear.
  const summaryCard = frameDocument.getElementById("summaryCard");
  const historyBody = frameDocument.getElementById("historyTableBody");
  await waitFor("session completes on its own", () =>
    !summaryCard.classList.contains("hidden") &&
    startBtn.textContent === "Start" &&
    historyBody.children.length >= 1, 75000);
}

async function verifySuppressionMessage(frameWindow, frameDocument, expectedFragment) {
  const statusEl = frameDocument.getElementById("status");
  dispatchKey(frameWindow, "KeyS", "s");
  await waitFor("suppression status", () =>
    String(statusEl.textContent || "").includes("Suppression reported"));

  const text = String(statusEl.textContent || "");
  if (!text.includes(expectedFragment)) {
    throw new Error(`Suppression message: expected "${expectedFragment}", got "${text}"`);
  }
}

async function verifyResumeDisplayChange(frameWindow, frameDocument, startBtn) {
  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("pause for display-change test", () => {
    const pauseCard = frameDocument.getElementById("pauseCard");
    return !pauseCard.hidden && startBtn.textContent === "Resume";
  });

  const changedDpr = (frameWindow.devicePixelRatio || 1) + 0.5;
  try {
    Object.defineProperty(frameWindow, "devicePixelRatio", { configurable: true, value: changedDpr });
  } catch {
    frameWindow.devicePixelRatio = changedDpr;
  }

  dispatchKey(frameWindow, "KeyP", "p");
  await waitFor("session ends on resume after display change", () => {
    const statusText = String(frameDocument.getElementById("status")?.textContent || "");
    return startBtn.textContent === "Start" && startBtn.disabled === false && statusText.includes("Session ended");
  });

  const confirmBtn = frameDocument.getElementById("monitorWidthConfirmBtn");
  if (confirmBtn.hidden) {
    throw new Error("Display-change resume failed: reconfirm control did not reappear");
  }
  const statusText = String(frameDocument.getElementById("status")?.textContent || "");
  if (!statusText.toLowerCase().includes("monitor width")) {
    throw new Error(`Display-change resume failed: status did not prompt reconfirm, got "${statusText}"`);
  }
}

async function verifyCorruptHistoryBoots() {
  const corrupt = [
    {
      endedAt: new Date(600000).toISOString(),
      mode: "convergence", bestPd: 20, totalScore: 5, rounds: 10, suppressions: 0,
      ranges: [{ exercise: "convergence", breakPd: 24 }]
    },
    {
      endedAt: new Date(1200000).toISOString(),
      mode: "convergence", bestPd: 1e12, totalScore: 3, rounds: 8, suppressions: 1, ranges: []
    },
    "not an object",
    { ranges: "bad", bestPd: "x" }
  ];

  const { frameDocument } = await bootWithSeededHistory(corrupt);
  try {
    // Three of the four seeded entries are objects and must each render a row.
    // A crash on the break-without-recovery record aborts the loop mid-render,
    // leaving fewer rows; a freeze on bestPd 1e12 hangs the boot wait above.
    const rowCount = frameDocument.getElementById("historyTableBody").children.length;
    if (rowCount !== 3) {
      throw new Error(`Corrupt history: expected 3 rendered rows, got ${rowCount}`);
    }
    // refreshIdlePreview runs after the history render; a status message proves
    // startup completed past it rather than aborting on a bad record.
    const statusText = String(frameDocument.getElementById("status")?.textContent || "");
    if (statusText.trim() === "") {
      throw new Error("Corrupt history: startup did not complete after rendering history");
    }
  } finally {
    clearFrameSessionHistory();
  }
}

async function bootWithSeededHistory(records) {
  const boot = await bootFreshApp();
  boot.frameWindow.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  await loadFrame();
  const frameWindow = appFrame.contentWindow;
  const frameDocument = frameWindow.document;
  await waitFor("app boot with seeded history", () => {
    const startBtn = frameDocument.getElementById("startBtn");
    const vergenceModeInput = frameDocument.getElementById("vergenceMode");
    return startBtn && vergenceModeInput && vergenceModeInput.options.length > 0;
  });
  installFullscreenStub(frameWindow);
  return { frameWindow, frameDocument };
}

// A saved divergence config must boot cleanly. The physiologic cap for
// divergence is computed at startup, and if its constants are not yet defined
// the whole init throws and the app never reaches the ready state. Scenarios
// normally boot with clearSettings, which hides this by discarding the config.
async function verifyPersistedDivergenceBoots() {
  const boot = await bootFreshApp();
  const configKey = getStorageKey(boot.frameWindow);
  boot.frameWindow.localStorage.setItem(configKey, JSON.stringify({
    monitorWidthIn: 24,
    monitorWidthConfirmed: true,
    monitorWidthNeedsReconfirm: false,
    displayContext: {
      screenWidth: boot.frameWindow.screen.width,
      screenHeight: boot.frameWindow.screen.height,
      devicePixelRatio: boot.frameWindow.devicePixelRatio || 1
    },
    viewDistanceIn: 16,
    leftDotIntensity: 0.9,
    rightDotIntensity: 0.9,
    vergenceMode: "divergence",
    fieldShape: "circle",
    fieldSize: "large",
    verticalPolarity: "standard",
    redLensSide: "right",
    visualPreset: "balanced",
    startPd: 0,
    goalPd: 30,
    sessionMinutes: 7,
    roundSeconds: 20
  }));

  clearSettingsForBoot = "";
  try {
    await loadFrame();
    const frameDocument = appFrame.contentWindow.document;
    await waitFor("persisted divergence config boots", () =>
      frameDocument.getElementById("startBtn") &&
      String(frameDocument.getElementById("status")?.textContent || "").startsWith("Ready:"));

    const statusText = String(frameDocument.getElementById("status").textContent || "");
    if (!statusText.includes("mode Divergence")) {
      throw new Error(`Persisted divergence boot: expected Divergence in ready status, got "${statusText}"`);
    }
    // The saved 30 goal must have clamped to the physiologic divergence ceiling,
    // proving the cap ran during init rather than throwing.
    if (!statusText.includes("session target 21.0Δ")) {
      throw new Error(`Persisted divergence boot: expected goal capped to 21.0, got "${statusText}"`);
    }
  } finally {
    clearSettingsForBoot = "1";
    try {
      appFrame.contentWindow.localStorage.removeItem(getStorageKey(appFrame.contentWindow));
    } catch {
      // Frame may be mid-navigation; the next clearSettings boot clears it anyway.
    }
  }
}

async function verifyDebugSessionMarked() {
  const seeded = [
    {
      endedAt: new Date(600000).toISOString(),
      mode: "convergence", bestPd: 10, totalScore: 4, rounds: 10, suppressions: 0,
      ranges: [{ exercise: "convergence", breakPd: 14, recoveryPd: 9 }]
    },
    {
      endedAt: new Date(1200000).toISOString(),
      debug: true, mode: "convergence", bestPd: 40, totalScore: 8, rounds: 12, suppressions: 0,
      ranges: [{ exercise: "convergence", breakPd: 44, recoveryPd: 30 }]
    }
  ];

  const { frameDocument } = await bootWithSeededHistory(seeded);
  try {
    const rows = [...frameDocument.getElementById("historyTableBody").children];
    if (rows.length !== 2) {
      throw new Error(`Debug tagging: expected 2 rows, got ${rows.length}`);
    }
    const debugRows = rows.filter(row => row.textContent.includes("(debug)"));
    if (debugRows.length !== 1) {
      throw new Error(`Debug tagging: expected exactly 1 row marked debug, got ${debugRows.length}`);
    }
    // Only one of the two sessions is non-debug, so once the debug session is
    // excluded the trend has a single point and stays hidden. If the filter
    // were missing, both points would show and the chart would appear.
    const trendWrap = frameDocument.getElementById("historyTrendWrap");
    if (!trendWrap.hidden) {
      throw new Error("Debug tagging: trend chart included the debug session");
    }
  } finally {
    clearFrameSessionHistory();
  }
}

async function verifyTrendHoverUsesCache() {
  const seeded = [
    { endedAt: new Date(600000).toISOString(), mode: "convergence", bestPd: 10, totalScore: 4, rounds: 10, suppressions: 0, ranges: [{ exercise: "convergence", breakPd: 14, recoveryPd: 9 }] },
    { endedAt: new Date(1200000).toISOString(), mode: "convergence", bestPd: 16, totalScore: 6, rounds: 12, suppressions: 0, ranges: [{ exercise: "convergence", breakPd: 20, recoveryPd: 13 }] },
    { endedAt: new Date(1800000).toISOString(), mode: "convergence", bestPd: 22, totalScore: 7, rounds: 14, suppressions: 0, ranges: [{ exercise: "convergence", breakPd: 26, recoveryPd: 18 }] }
  ];

  const { frameWindow, frameDocument } = await bootWithSeededHistory(seeded);
  try {
    const canvas = frameDocument.getElementById("historyTrend");
    const tooltip = frameDocument.getElementById("historyTrendTooltip");
    const trendWrap = frameDocument.getElementById("historyTrendWrap");
    if (trendWrap.hidden) {
      throw new Error("Trend hover: chart did not render for seeded data");
    }

    // Drop the store after the chart is drawn. A hover that re-read storage
    // would find it empty and hide the chart; using the cached data keeps the
    // chart up and shows the tooltip.
    frameWindow.localStorage.removeItem(HISTORY_STORAGE_KEY);

    const rect = canvas.getBoundingClientRect();
    const MouseEventCtor = frameWindow.MouseEvent || MouseEvent;
    canvas.dispatchEvent(new MouseEventCtor("mousemove", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5
    }));

    await waitFor("trend tooltip appears from cache", () =>
      !tooltip.hidden && tooltip.textContent.includes("Best PD") && !trendWrap.hidden);

    canvas.dispatchEvent(new MouseEventCtor("mouseleave", { bubbles: true }));
    await waitFor("trend tooltip hides on leave", () => tooltip.hidden);
  } finally {
    clearFrameSessionHistory();
  }
}

function importFileIntoInput(frameWindow, fileInput, text) {
  const file = new frameWindow.File([text], "history.json", { type: "application/json" });
  const transfer = new frameWindow.DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new (frameWindow.Event || Event)("change", { bubbles: true }));
  return delay(60);
}

async function verifyHistoryImport() {
  const { frameWindow, frameDocument } = await bootFreshApp();
  try {
    const fileInput = frameDocument.getElementById("historyImportFile");
    const tableBody = frameDocument.getElementById("historyTableBody");
    const statusEl = frameDocument.getElementById("status");

    const records = [
      { endedAt: new Date(600000).toISOString(), mode: "convergence", bestPd: 10, totalScore: 4, rounds: 10, suppressions: 0, ranges: [] },
      { endedAt: new Date(1200000).toISOString(), mode: "divergence", bestPd: 12, totalScore: 5, rounds: 11, suppressions: 0, ranges: [] }
    ];

    await importFileIntoInput(frameWindow, fileInput, JSON.stringify(records));
    await waitFor("import adds two sessions", () =>
      tableBody.children.length === 2 && String(statusEl.textContent || "").includes("Imported 2 new"));

    // Re-importing the same file must not duplicate anything.
    await importFileIntoInput(frameWindow, fileInput, JSON.stringify(records));
    await waitFor("re-import dedupes", () =>
      tableBody.children.length === 2 && String(statusEl.textContent || "").includes("Imported 0 new"));

    // A malformed file is rejected and leaves the history untouched.
    await importFileIntoInput(frameWindow, fileInput, "not json {");
    await waitFor("invalid import warns", () => String(statusEl.textContent || "").includes("Import failed"));
    if (tableBody.children.length !== 2) {
      throw new Error(`Invalid import changed the history: ${tableBody.children.length} rows`);
    }
  } finally {
    clearFrameSessionHistory();
  }
}

async function runModeScenario(scenario) {
  catchParamForBoot = scenario.catchParam || "0";
  const { frameWindow, frameDocument } = await bootFreshApp();
  catchParamForBoot = "0";
  recordResult("pass", `${scenario.label}: app loaded`);
  recordResult("pass", `${scenario.label}: fullscreen requests stubbed`);

  await setMonitorWidth(frameWindow, frameDocument, 24);
  recordResult("pass", `${scenario.label}: monitor width confirmed`);

  await setSelectValue(frameWindow, frameDocument, "redLensSide", "left", "redLensSide");
  recordResult("pass", `${scenario.label}: red lens side chosen`);

  await setSelectValue(frameWindow, frameDocument, "vergenceMode", scenario.vergenceMode, "vergenceMode");
  await setSelectValue(frameWindow, frameDocument, "fieldShape", scenario.fieldShape, "fieldShape");
  await setSelectValue(frameWindow, frameDocument, "verticalPolarity", scenario.verticalPolarity, "verticalPolarity");
  await setNumericValue(frameWindow, frameDocument, "roundSeconds", 5, "roundSeconds");
  await setNumericValue(frameWindow, frameDocument, "sessionMinutes", 1, "sessionMinutes");
  recordResult("pass", `${scenario.label}: settings persisted`);

  await waitForReadyState(frameDocument);
  recordResult("pass", `${scenario.label}: ready state confirmed`);

  if (scenario.expectedGoalText) {
    const statusText = String(frameDocument.getElementById("status")?.textContent || "");
    if (!statusText.includes(scenario.expectedGoalText)) {
      throw new Error(`${scenario.label}: expected "${scenario.expectedGoalText}" in ready status, got "${statusText}"`);
    }
    recordResult("pass", `${scenario.label}: goal capped to physiology`);
  }

  const { startBtn, debugStatusEl } = await startSession(frameDocument);
  recordResult("pass", `${scenario.label}: session started`);

  const initialDebugState = parseDebugStatus(debugStatusEl.textContent);
  assertOneOf(initialDebugState.exercise, scenario.expectedInitialExercises, `${scenario.label} initial exercise`);
  if (!getCurrentAxis(frameDocument).includes(` ${scenario.expectedAxis}`)) {
    throw new Error(`${scenario.label}: expected Eye Split axis ${scenario.expectedAxis}`);
  }
  recordResult("pass", `${scenario.label}: initial exercise and axis verified`);

  if (scenario.verifySmoothRamp) {
    await verifySmoothRamp(frameDocument);
    recordResult("pass", `${scenario.label}: demand ramps continuously`);
  }

  if (scenario.verifyDebugHotkeys) {
    await verifyDebugHotkeys(frameWindow, frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: debug hotkeys verified`);
  }

  if (scenario.verifyTimeoutGuard) {
    await verifyTimeoutGuard(frameWindow, frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: timeout transition lock verified`);
  }

  if (scenario.verifyTimeoutPauseResume) {
    await verifyPauseDuringTimeoutTransition(frameWindow, frameDocument, debugStatusEl, startBtn);
    recordResult("pass", `${scenario.label}: timeout-transition pause/resume verified`);
  }

  if (scenario.verifyResetDuringTimeoutTransition) {
    await verifyResetDuringTimeoutTransition(frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: reset during timeout transition verified`);
    return;
  }

  if (scenario.verifyResumeDisplayChange) {
    await verifyResumeDisplayChange(frameWindow, frameDocument, startBtn);
    recordResult("pass", `${scenario.label}: resume after display change ends session`);
    return;
  }

  if (scenario.verifyCatchTrials) {
    await verifyCatchTrials(frameWindow, frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: false alarms and correct rejections tracked`);
    return;
  }

  if (scenario.verifyScoringAndCompletion) {
    await verifyScoringAndCompletion(frameWindow, frameDocument, debugStatusEl, startBtn);
    recordResult("pass", `${scenario.label}: wrong answer, staircase step-up, and natural completion verified`);
    return;
  }

  await answerCurrentRoundCorrectly(frameWindow, frameDocument, debugStatusEl);
  const nextDebugState = parseDebugStatus(debugStatusEl.textContent);
  assertOneOf(nextDebugState.exercise, scenario.expectedNextExercises, `${scenario.label} next exercise`);
  if (!getCurrentAxis(frameDocument).includes(` ${scenario.expectedAxis}`)) {
    throw new Error(`${scenario.label}: expected Eye Split axis ${scenario.expectedAxis} after round advance`);
  }
  recordResult("pass", `${scenario.label}: round advance verified`);

  if (scenario.suppressionDemandText) {
    await verifySuppressionMessage(frameWindow, frameDocument, scenario.suppressionDemandText);
    recordResult("pass", `${scenario.label}: suppression message verified`);
  }

  if (scenario.verifyRangeDescent) {
    await verifyRangeDescent(frameWindow, frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: break descent does not cost score`);
  }

  if (scenario.verifyPauseResume) {
    await verifyPauseResume(frameWindow, frameDocument, startBtn);
    recordResult("pass", `${scenario.label}: pause/resume verified`);
  }

  if (scenario.verifyFocusLossPause) {
    await verifyFocusLossPause(frameWindow, frameDocument, startBtn);
    recordResult("pass", `${scenario.label}: focus-loss auto-pause verified`);
  }

  if (scenario.verifyResizeDuringPause) {
    await verifyResizeDuringPause(frameWindow, frameDocument, startBtn);
    recordResult("pass", `${scenario.label}: resize during pause keeps the clock frozen`);
  }

  await stopScenarioSession(frameDocument);
  recordResult("pass", `${scenario.label}: scenario reset`);
}

async function runSmokeSuite() {
  runInProgress = true;
  runBtn.disabled = true;
  appFrame.style.pointerEvents = "none";
  clearResults();
  recordResult("pass", "Starting smoke suite");
  let suiteError = null;
  try {
    await verifyPersistedDivergenceBoots();
    recordResult("pass", "Persisted divergence config boots to ready");

    await verifyCorruptHistoryBoots();
    recordResult("pass", "Corrupt history boots and renders safely");

    await verifyDebugSessionMarked();
    recordResult("pass", "Debug sessions are marked and kept out of the trend");

    await verifyTrendHoverUsesCache();
    recordResult("pass", "Trend hover uses cached data and keeps the chart up");

    await verifyHistoryImport();
    recordResult("pass", "History import merges and dedupes, rejects bad files");

    for (const scenario of MODE_SCENARIOS) {
      await runModeScenario(scenario);
    }

    recordResult("pass", "Smoke suite completed");
  } catch (error) {
    suiteError = error;
    throw error;
  } finally {
    try {
      await unloadFrame();
      recordResult("pass", "Smoke suite cleanup completed");
    } catch (cleanupError) {
      recordResult("fail", "Smoke suite cleanup failed", cleanupError.message);
      if (!suiteError) {
        throw cleanupError;
      }
    }
  }
}
