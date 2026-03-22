const runBtn = document.getElementById("runBtn");
const resultsEl = document.getElementById("results");
const appFrame = document.getElementById("appFrame");
let runInProgress = false;
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
    verifyPauseResume: true
  },
  {
    label: "Divergence / Circle",
    vergenceMode: "divergence",
    fieldShape: "circle",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Divergence"],
    expectedNextExercises: ["Divergence"],
    expectedAxis: "H"
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
    label: "Vergence Up / Square",
    vergenceMode: "vergence_up",
    fieldShape: "square",
    verticalPolarity: "standard",
    expectedInitialExercises: ["Vergence Up"],
    expectedNextExercises: ["Vergence Up"],
    expectedAxis: "V"
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
  if (runInProgress) return;
  runSmokeSuite().catch(error => {
    recordResult("fail", "Smoke suite failed", error.message);
  }).finally(() => {
    runInProgress = false;
    runBtn.disabled = false;
    appFrame.style.pointerEvents = "";
  });
});

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
  url.searchParams.set("clearSettings", "1");
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

function readStoredConfig(frameWindow) {
  return JSON.parse(frameWindow.localStorage.getItem("vergence_trainer.config.v1") || "{}");
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

function assertOneOf(actual, expectedValues, label) {
  if (expectedValues.includes(actual)) return;
  throw new Error(`${label}: expected one of [${expectedValues.join(", ")}], got ${actual || "(missing)"}`);
}

async function bootFreshApp() {
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
  monitorWidthInput.value = String(widthIn);
  dispatchFrameEvent(frameWindow, monitorWidthInput, "input");
  dispatchFrameEvent(frameWindow, monitorWidthInput, "change");
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
    return text.includes("Ready:") && !text.includes("Set Monitor Width");
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

async function runModeScenario(scenario) {
  const { frameWindow, frameDocument } = await bootFreshApp();
  recordResult("pass", `${scenario.label}: app loaded`);
  recordResult("pass", `${scenario.label}: fullscreen requests stubbed`);

  await setMonitorWidth(frameWindow, frameDocument, 24);
  recordResult("pass", `${scenario.label}: monitor width confirmed`);

  await setSelectValue(frameWindow, frameDocument, "vergenceMode", scenario.vergenceMode, "vergenceMode");
  await setSelectValue(frameWindow, frameDocument, "fieldShape", scenario.fieldShape, "fieldShape");
  await setSelectValue(frameWindow, frameDocument, "verticalPolarity", scenario.verticalPolarity, "verticalPolarity");
  await setNumericValue(frameWindow, frameDocument, "roundSeconds", 5, "roundSeconds");
  await setNumericValue(frameWindow, frameDocument, "sessionMinutes", 1, "sessionMinutes");
  recordResult("pass", `${scenario.label}: settings persisted`);

  await waitForReadyState(frameDocument);
  recordResult("pass", `${scenario.label}: ready state confirmed`);

  const { startBtn, debugStatusEl } = await startSession(frameDocument);
  recordResult("pass", `${scenario.label}: session started`);

  const initialDebugState = parseDebugStatus(debugStatusEl.textContent);
  assertOneOf(initialDebugState.exercise, scenario.expectedInitialExercises, `${scenario.label} initial exercise`);
  if (!getCurrentAxis(frameDocument).includes(` ${scenario.expectedAxis}`)) {
    throw new Error(`${scenario.label}: expected Eye Split axis ${scenario.expectedAxis}`);
  }
  recordResult("pass", `${scenario.label}: initial exercise and axis verified`);

  if (scenario.verifyDebugHotkeys) {
    await verifyDebugHotkeys(frameWindow, frameDocument, debugStatusEl);
    recordResult("pass", `${scenario.label}: debug hotkeys verified`);
  }

  await answerCurrentRoundCorrectly(frameWindow, frameDocument, debugStatusEl);
  const nextDebugState = parseDebugStatus(debugStatusEl.textContent);
  assertOneOf(nextDebugState.exercise, scenario.expectedNextExercises, `${scenario.label} next exercise`);
  if (!getCurrentAxis(frameDocument).includes(` ${scenario.expectedAxis}`)) {
    throw new Error(`${scenario.label}: expected Eye Split axis ${scenario.expectedAxis} after round advance`);
  }
  recordResult("pass", `${scenario.label}: round advance verified`);

  if (scenario.verifyPauseResume) {
    await verifyPauseResume(frameWindow, frameDocument, startBtn);
    recordResult("pass", `${scenario.label}: pause/resume verified`);
  }
}

async function runSmokeSuite() {
  runInProgress = true;
  runBtn.disabled = true;
  appFrame.style.pointerEvents = "none";
  clearResults();
  recordResult("pass", "Starting smoke suite");
  for (const scenario of MODE_SCENARIOS) {
    await runModeScenario(scenario);
  }

  recordResult("pass", "Smoke suite completed");
}
