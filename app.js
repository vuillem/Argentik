import { processNegativeSpatial } from "./spatial.js";
import { buildCurveLUT, ensureCurvePresetOptions } from "./lut.js";

function $(id) { return document.getElementById(id); }

// --- UI / DOM ---
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const exportBtn = $("exportBtn");

const modeSelect = $("modeSelect");

const expoInput = $("expoTime");
const delayInput = $("delayTime");

const controls = $("controls");
const toggleControlsBtn = $("toggleControlsBtn");
const fullscreenBtn = $("fullscreenBtn");

const fileInput = $("fileInput");
const exposeBtn = $("exposeBtn");

// Bandes test : Tref + Δ + n + orientation
const refTimeInput = $("refTime");
const stepInput = $("stepTime");
const bandCountInput = $("bandCount");
const stripOrientationSelect = $("stripOrientation");

const curvePresetSelect = $("curvePreset");
const statusEl = $("status");

// Rotation / miroir
const mirrorBtn = $("mirrorBtn");
const rotLeftBtn = $("rotLeftBtn");
const rotRightBtn = $("rotRightBtn");
const rotResetBtn = $("rotResetBtn");
const rotValue = $("rotValue");

// Topbar (pour tout cacher pendant expo)
const topBar = document.getElementById("topBar");

// corrections locales pour contrer la diffusion des noirs
const spatialDefaults = {
  diffusionCompensationEnabled: true,
  diffusionHighlightThreshold: 0.72,
  diffusionEdgeStrength: 1.0,
  diffusionAmount: 0.12,

  edgeRestoreEnabled: true,
  edgeRestoreAmount: 0.08,
  edgeRestoreProtectShadows: 0.08,
  edgeRestoreProtectHighlights: 0.92
};

const state = {
  useSpatialPipeline: true,
  ...spatialDefaults
};

// --- Diagnostics ---
function setStatus(msg) {
  if (statusEl) statusEl.textContent = `Statut : ${msg}`;
}
window.addEventListener("error", (e) => setStatus(`ERREUR JS: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => setStatus(`PROMISE REJETÉE: ${String(e.reason)}`));

const required = [
  ["canvas", canvas],
  ["controls", controls],
  ["fileInput", fileInput],
  ["exposeBtn", exposeBtn],
  ["modeSelect", modeSelect],
  ["expoTime", expoInput],
  ["delayTime", delayInput],
  ["refTime", refTimeInput],
  ["stepTime", stepInput],
  ["bandCount", bandCountInput],
  ["stripOrientation", stripOrientationSelect],
  ["curvePreset", curvePresetSelect],
  ["exportBtn", exportBtn],
  ["mirrorBtn", mirrorBtn],
  ["rotLeftBtn", rotLeftBtn],
  ["rotRightBtn", rotRightBtn],
  ["rotResetBtn", rotResetBtn],
  ["rotValue", rotValue],
  ["status", statusEl],
];
const missing = required.filter(([, el]) => !el).map(([name]) => name);
if (missing.length) {
  setStatus(`ERREUR: éléments manquants -> ${missing.join(", ")}`);
  throw new Error("Missing DOM elements: " + missing.join(", "));
}

// --- State ---
let img = new Image();
let hasImage = false;
let isExposing = false;

let audioCtx = null;
let wakeLockSentinel = null;

let audioMaster = null;
let audioCompressor = null;
let audioPrimed = false;


let rotation = 0;      // 0, 90, 180, 270
let mirrored = false;  // false par défaut

let layoutRaf = 0;
let resizeResumeTimer = 0;

const processed = {
  ready: false,
  off: document.createElement("canvas"),
  offCtx: null,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  viewportW: 0,
  viewportH: 0,
};
processed.offCtx = processed.off.getContext("2d", { willReadFrequently: true });

const exposureState = {
  locked: false,
  viewportW: 0,
  viewportH: 0,
  frame: document.createElement("canvas"),
  frameCtx: null,
  preparedAt: 0,
  suppressResizeUntil: 0,
};
exposureState.frameCtx = exposureState.frame.getContext("2d", { alpha: false });


// --- Utils ---
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function clearTimer(id) { if (id) window.clearTimeout(id); }

function getAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function ensureAudioGraph() {
  const ac = getAudioCtx();
  if (!ac) return null;

  if (!audioCompressor) {
    audioCompressor = ac.createDynamicsCompressor();
    audioCompressor.threshold.setValueAtTime(-24, ac.currentTime);
    audioCompressor.knee.setValueAtTime(18, ac.currentTime);
    audioCompressor.ratio.setValueAtTime(12, ac.currentTime);
    audioCompressor.attack.setValueAtTime(0.003, ac.currentTime);
    audioCompressor.release.setValueAtTime(0.12, ac.currentTime);
  }

  if (!audioMaster) {
    audioMaster = ac.createGain();
    audioMaster.gain.setValueAtTime(0.95, ac.currentTime);
    audioCompressor.connect(audioMaster);
    audioMaster.connect(ac.destination);
  }

  return ac;
}

async function ensureAudioReady() {
  const ac = ensureAudioGraph();
  if (!ac) return null;

  if (ac.state === "suspended" || ac.state === "interrupted") {
    await ac.resume();
  }

  // Amorçage très bref pour stabiliser la chaîne audio iOS/Safari
  if (!audioPrimed) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ac.currentTime);
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    osc.connect(gain);
    gain.connect(audioCompressor);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.02);
    audioPrimed = true;
  }

  return ac;
}

function scheduleAlertBeep(ac, when, {
  freq = 2200,
  freqEnd = 2600,
  duration = 0.12,
  gainValue = 0.65,
  type = "square"
} = {}) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, when + duration * 0.8);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(gainValue * 0.75, when + duration * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  osc.connect(gain);
  gain.connect(audioCompressor);

  osc.start(when);
  osc.stop(when + duration + 0.02);
}

const BAND_LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

function measureBandLabelWidth(ctx, text, {
  fontSize = 26,
  squeeze = 0.84,
  weight = 600,
  letterSpacing = 0.2
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${BAND_LABEL_FONT_FAMILY}`;

  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += ctx.measureText(text[i]).width * squeeze;
    if (i < text.length - 1) width += letterSpacing;
  }

  ctx.restore();
  return width;
}

function drawBandLabel(ctx, text, x, y, {
  fontSize = 26,
  squeeze = 0.84,
  weight = 600,
  color = "rgb(170,170,170)",
  letterSpacing = 0.2
} = {}) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(squeeze, 1);

  ctx.font = `${weight} ${fontSize}px ${BAND_LABEL_FONT_FAMILY}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = color;

  let dx = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    ctx.fillText(ch, dx, 0);
    dx += ctx.measureText(ch).width;
    if (i < text.length - 1) dx += letterSpacing / squeeze;
  }

  ctx.restore();
}

async function acquireWakeLock() {
  try {
    if (!("wakeLock" in navigator)) return;
    wakeLockSentinel = await navigator.wakeLock.request("screen");
  } catch (err) {
    console.warn("WakeLock error:", err);
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (err) {
    console.warn("WakeLock release error:", err);
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && isExposing) {
    await acquireWakeLock();
    await ensureAudioReady();
  }
});

function blackScreen(targetCtx = ctx, width = canvas.width, height = canvas.height) {
  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  targetCtx.fillStyle = "black";
  targetCtx.fillRect(0, 0, width, height);
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.max(1, Math.round(vv ? vv.width : window.innerWidth)),
    height: Math.max(1, Math.round(vv ? vv.height : window.innerHeight)),
  };
}

function enterExposureMode() {
  controls.classList.add("hidden");
  if (topBar) topBar.style.display = "none";
  if (statusEl) statusEl.textContent = "";
}

function exitExposureMode() {
  if (topBar) topBar.style.display = "";
  controls.classList.remove("hidden");
}

function lockCanvasViewport(width, height) {
  exposureState.locked = true;
  exposureState.viewportW = width;
  exposureState.viewportH = height;
  exposureState.preparedAt = Date.now();
  exposureState.suppressResizeUntil = Date.now() + 1500;

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function unlockCanvasViewport() {
  exposureState.locked = false;
  exposureState.viewportW = 0;
  exposureState.viewportH = 0;
  exposureState.preparedAt = 0;
  exposureState.suppressResizeUntil = 0;
  canvas.style.width = "";
  canvas.style.height = "";
}

function resizeCanvas(force = false) {
  if ((exposureState.locked || isExposing) && !force) {
    return;
  }

  const { width, height } = getViewportSize();
  canvas.width = width;
  canvas.height = height;

  blackScreen();
  if (hasImage && img.complete && img.naturalWidth) {
    buildProcessedImage(width, height);
    drawProcessedFull();
  }
}

function scheduleResize(force = false) {
  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = 0;
    resizeCanvas(force);
  });
}

function maybeHandleResize() {
  if (exposureState.locked || isExposing) {
    return;
  }

  clearTimer(resizeResumeTimer);
  resizeResumeTimer = window.setTimeout(() => {
    scheduleResize(false);
  }, 80);
}

window.addEventListener("resize", maybeHandleResize, { passive: true });
window.addEventListener("orientationchange", () => {
  if (exposureState.locked|| isExposing) return;
  clearTimer(resizeResumeTimer);
  resizeResumeTimer = window.setTimeout(() => scheduleResize(false), 250);
}, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", maybeHandleResize, { passive: true });
}

resizeCanvas(true);

async function signalEndExposure() {
  const ac = await ensureAudioReady();
  if (!ac) return;

  const t = ac.currentTime + 0.03;

  // Séquence plus saillante, pensée pour être entendue en ambiance
  scheduleAlertBeep(ac, t + 0.00, { freq: 1800, freqEnd: 2200, duration: 0.10, gainValue: 0.60, type: "square" });
  scheduleAlertBeep(ac, t + 0.16, { freq: 2400, freqEnd: 3000, duration: 0.10, gainValue: 0.72, type: "square" });
  scheduleAlertBeep(ac, t + 0.32, { freq: 1800, freqEnd: 2200, duration: 0.10, gainValue: 0.60, type: "square" });
  scheduleAlertBeep(ac, t + 0.52, { freq: 2800, freqEnd: 3400, duration: 0.22, gainValue: 0.82, type: "square" });
}

ensureCurvePresetOptions(curvePresetSelect);
let curveLUT = buildCurveLUT(curvePresetSelect.value);

curvePresetSelect.addEventListener("change", () => {
  curveLUT = buildCurveLUT(curvePresetSelect.value);
  if (hasImage && img.complete && img.naturalWidth && !isExposing) {
    buildProcessedImage(canvas.width, canvas.height);
    drawProcessedFull();
  }
  setStatus(`courbe: ${curvePresetSelect.value}`);
});

// --- Rotation / miroir ---
function normRot(d) { return ((d % 360) + 360) % 360; }
function updateRotUI() { rotValue.textContent = `${rotation}°`; }

mirrorBtn.addEventListener("click", () => {
  mirrored = !mirrored;
  if (hasImage && img.complete && img.naturalWidth && !isExposing) {
    buildProcessedImage(canvas.width, canvas.height);
    drawProcessedFull();
  }
  setStatus(mirrored ? "miroir: ON" : "miroir: OFF");
});

rotLeftBtn.addEventListener("click", () => {
  rotation = normRot(rotation - 90);
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth && !isExposing) {
    buildProcessedImage(canvas.width, canvas.height);
    drawProcessedFull();
  }
});

rotRightBtn.addEventListener("click", () => {
  rotation = normRot(rotation + 90);
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth && !isExposing) {
    buildProcessedImage(canvas.width, canvas.height);
    drawProcessedFull();
  }
});

rotResetBtn.addEventListener("click", () => {
  rotation = 0;
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth && !isExposing) {
    buildProcessedImage(canvas.width, canvas.height);
    drawProcessedFull();
  }
});

updateRotUI();

function buildProcessedImage(targetW = canvas.width, targetH = canvas.height) {
  processed.ready = false;

  const rot90 = rotation === 90 || rotation === 270;
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  const effW = rot90 ? sourceH : sourceW;
  const effH = rot90 ? sourceW : sourceH;

  const scale = Math.min(targetW / effW, targetH / effH);
  const w = Math.max(1, Math.floor(effW * scale));
  const h = Math.max(1, Math.floor(effH * scale));
  const x = Math.floor((targetW - w) / 2);
  const y = Math.floor((targetH - h) / 2);

  processed.viewportW = targetW;
  processed.viewportH = targetH;
  processed.x = x;
  processed.y = y;
  processed.w = w;
  processed.h = h;
  processed.off.width = w;
  processed.off.height = h;

  const octx = processed.offCtx;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, w, h);

  const drawW = rot90 ? h : w;
  const drawH = rot90 ? w : h;

  octx.save();
  octx.translate(w / 2, h / 2);
  octx.rotate((rotation * Math.PI) / 180);
  if (mirrored) octx.scale(-1, 1);
  octx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  octx.restore();

  const imageData = octx.getImageData(0, 0, w, h);

  let processedImageData;

  if (state.useSpatialPipeline) {
    processedImageData = processNegativeSpatial(imageData, {
      paperCurveFn: (x) => curveLUT[Math.max(0, Math.min(255, Math.round(x * 255)))] / 255,

      diffusionCompensationEnabled: state.diffusionCompensationEnabled,
      diffusionHighlightThreshold: state.diffusionHighlightThreshold,
      diffusionEdgeStrength: state.diffusionEdgeStrength,
      diffusionAmount: state.diffusionAmount,

      edgeRestoreEnabled: state.edgeRestoreEnabled,
      edgeRestoreAmount: state.edgeRestoreAmount,
      edgeRestoreProtectShadows: state.edgeRestoreProtectShadows,
      edgeRestoreProtectHighlights: state.edgeRestoreProtectHighlights
    });
  } else {
    processedImageData = imageData;
  }

  octx.putImageData(processedImageData, 0, 0);
  processed.ready = true;
}

function drawProcessedFull(targetCtx = ctx) {
  blackScreen(targetCtx, canvas.width, canvas.height);
  if (!processed.ready) return;
  targetCtx.drawImage(processed.off, processed.x, processed.y, processed.w, processed.h);
}

function getBandRect(bandIndex, totalBands, orientation) {
  if (orientation === "vertical") {
    const bandW = processed.w / totalBands;
    const x0 = Math.floor(processed.x + bandW * bandIndex);
    const x1 = Math.floor(processed.x + bandW * (bandIndex + 1));
    return { x: x0, y: processed.y, w: Math.max(1, x1 - x0), h: processed.h };
  }

  const bandH = processed.h / totalBands;
  const y0 = Math.floor(processed.y + bandH * bandIndex);
  const y1 = Math.floor(processed.y + bandH * (bandIndex + 1));
  return { x: processed.x, y: y0, w: processed.w, h: Math.max(1, y1 - y0) };
}

function drawProcessedSingleBandWithLabel(bandIndex, totalBands, orientation, labelText, targetCtx = ctx) {
  blackScreen(targetCtx, canvas.width, canvas.height);
  if (!processed.ready) return;

  targetCtx.drawImage(processed.off, processed.x, processed.y, processed.w, processed.h);

  const band = getBandRect(bandIndex, totalBands, orientation);
  targetCtx.fillStyle = "black";

  if (orientation === "vertical") {
    if (band.x > processed.x) {
      targetCtx.fillRect(processed.x, processed.y, band.x - processed.x, processed.h);
    }
    const rightX = band.x + band.w;
    const rightW = (processed.x + processed.w) - rightX;
    if (rightW > 0) {
      targetCtx.fillRect(rightX, processed.y, rightW, processed.h);
    }
  } else {
    if (band.y > processed.y) {
      targetCtx.fillRect(processed.x, processed.y, processed.w, band.y - processed.y);
    }
    const bottomY = band.y + band.h;
    const bottomH = (processed.y + processed.h) - bottomY;
    if (bottomH > 0) {
      targetCtx.fillRect(processed.x, bottomY, processed.w, bottomH);
    }
  }

  const pad = Math.max(8, Math.floor(Math.min(band.w, band.h) * 0.09));
const text = String(labelText).replace(/\.0s$/, "s");

let fontPx = Math.max(20, Math.min(64, Math.floor(Math.min(band.w, band.h) * 0.24)));

const labelOpts = {
  fontSize: fontPx,
  squeeze: 0.82,
  weight: 600,
  color: "rgb(170,170,170)",
  letterSpacing: 0.2
};

const labelCanvas = document.createElement("canvas");
const lctx = labelCanvas.getContext("2d");

let textW = 0;
let boxW = 0;
const maxW = Math.max(24, band.w - pad * 2);

while (fontPx > 12) {
  labelOpts.fontSize = fontPx;
  textW = measureBandLabelWidth(lctx, text, labelOpts);
  boxW = Math.ceil(textW + pad * 2);

  if (boxW <= maxW) break;
  fontPx -= 1;
}

labelOpts.fontSize = fontPx;
textW = measureBandLabelWidth(lctx, text, labelOpts);
boxW = Math.ceil(textW + pad * 2);

const boxH = Math.ceil(fontPx + pad * 1.2);

let bx = band.x + pad;
let by = band.y + pad;

if (bx + boxW > band.x + band.w - 2) {
  bx = Math.max(band.x + 2, band.x + band.w - boxW - 2);
}
if (by + boxH > band.y + band.h - 2) {
  by = Math.max(band.y + 2, band.y + band.h - boxH - 2);
}

targetCtx.fillStyle = "black";
targetCtx.fillRect(bx, by, boxW, boxH);

labelCanvas.width = boxW;
labelCanvas.height = boxH;
lctx.clearRect(0, 0, boxW, boxH);

drawBandLabel(lctx, text, pad, Math.round(boxH / 2), labelOpts);

if (mirrored) {
  targetCtx.save();
  targetCtx.translate(bx + boxW, by);
  targetCtx.scale(-1, 1);
  targetCtx.drawImage(labelCanvas, 0, 0);
  targetCtx.restore();
} else {
  targetCtx.drawImage(labelCanvas, bx, by);
}
} 

function computeBandTimesSorted(tRef, delta, n) {
  const mid = (n - 1) / 2;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = tRef + (i - mid) * delta;
    times.push(Math.max(0.1, t));
  }
  return times.slice().sort((a, b) => a - b);
}

function prepareExposureFrame() {
  const viewport = getViewportSize();
  lockCanvasViewport(viewport.width, viewport.height);
  buildProcessedImage(viewport.width, viewport.height);

  exposureState.frame.width = viewport.width;
  exposureState.frame.height = viewport.height;
  blackScreen(exposureState.frameCtx, viewport.width, viewport.height);

  if (processed.ready) {
    exposureState.frameCtx.drawImage(processed.off, processed.x, processed.y, processed.w, processed.h);
  }

  blackScreen(ctx, canvas.width, canvas.height);
}

function blitExposureFrame() {
  if (!exposureState.frame.width || !exposureState.frame.height) return;
  blackScreen(ctx, canvas.width, canvas.height);
  ctx.drawImage(exposureState.frame, 0, 0, canvas.width, canvas.height);
}

function clearExposureFrame() {
  exposureState.frame.width = 1;
  exposureState.frame.height = 1;
  blackScreen(exposureState.frameCtx, 1, 1);
}

function lockExposureEnvironment() {
  document.documentElement.classList.add("exposure-lock");
  document.body.classList.add("exposure-lock");

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  document.documentElement.style.touchAction = "none";
  document.body.style.touchAction = "none";
}

function unlockExposureEnvironment() {
  document.documentElement.classList.remove("exposure-lock");
  document.body.classList.remove("exposure-lock");

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  document.documentElement.style.touchAction = "";
  document.body.style.touchAction = "";
}

function setControlsDisabled(disabled) {
  const fields = document.querySelectorAll("input, select, textarea, button");
  fields.forEach((el) => {
    if (el.id === "toggleControlsBtn") return;
    el.disabled = disabled;
  });
}

function preventDuringExposure(e) {
  if (!isExposing) return;
  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener("touchstart", preventDuringExposure, { passive: false });
document.addEventListener("touchmove", preventDuringExposure, { passive: false });
document.addEventListener("touchend", preventDuringExposure, { passive: false });
document.addEventListener("gesturestart", preventDuringExposure, { passive: false });
document.addEventListener("gesturechange", preventDuringExposure, { passive: false });
document.addEventListener("gestureend", preventDuringExposure, { passive: false });
fileInput.addEventListener("change", (e) => {
  try {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setStatus("aucun fichier sélectionné");
      return;
    }

    setStatus("lecture fichier…");

    const reader = new FileReader();
    reader.onerror = () => setStatus("erreur FileReader");
    reader.onload = (event) => {
      const newImg = new Image();
      newImg.onload = () => {
        img = newImg;
        hasImage = true;
        buildProcessedImage(canvas.width, canvas.height);
        drawProcessedFull();
        setStatus("image chargée");
        fileInput.value = "";
      };
      newImg.onerror = () => setStatus("erreur chargement image");
      newImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
  } catch (err) {
    setStatus(`exception import: ${err.message}`);
  }
});

async function runFullExposure(delayMs, expoMs) {
  blackScreen();
  await sleep(delayMs);
  blitExposureFrame();
  await sleep(expoMs);
  await signalEndExposure();
  await sleep(850);
  blackScreen();
  await sleep(delayMs);
}

async function runIndependentBandsWithLabels(delayMs, tRefSec, deltaSec, bandCount, orientation) {
  const times = computeBandTimesSorted(tRefSec, deltaSec, bandCount);
  blackScreen();
  await sleep(delayMs);

  const blinkMs = 140;

  for (let i = 0; i < bandCount; i++) {
    const t = times[i];
    const label = `${t.toFixed(1)}s`;

    drawProcessedSingleBandWithLabel(i, bandCount, orientation, label, ctx);
    await sleep(Math.round(t * 1000));

    blackScreen();
    await sleep(blinkMs);
  }

  await signalEndExposure();
  await sleep(350);
  blackScreen();
  await sleep(delayMs);
  return times;
}

async function beginExposureSession() {
  lockExposureEnvironment();
  setControlsDisabled(true);
  isExposing = true ;

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  await new Promise(r => setTimeout(r, 150));

  prepareExposureFrame();
  enterExposureMode();
  await acquireWakeLock();

    const ac = await ensureAudioReady();
  if (ac && (ac.state === "suspended" || ac.state === "interrupted")) {
    await ac.resume();
  }
}

async function endExposureSession() {
  await releaseWakeLock();
  isExposing = false;
  exitExposureMode();
  clearExposureFrame();
  unlockCanvasViewport();
  unlockExposureEnvironment();
  setControlsDisabled(false);
  resizeCanvas(true);
}

exposeBtn.addEventListener("click", async () => {
  if (isExposing) return;
  if (!hasImage) {
    setStatus("importe une image d'abord");
    return;
  }

  const delaySeconds = parseFloat(delayInput.value);
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
    setStatus("délai invalide");
    return;
  }
  const delayMs = Math.round(delaySeconds * 1000);

  try {
    await beginExposureSession();

    if (modeSelect.value === "full") {
      const expoSeconds = parseFloat(expoInput.value);
      if (!Number.isFinite(expoSeconds) || expoSeconds <= 0) {
        setStatus("temps expo invalide");
        return;
      }

      await runFullExposure(delayMs, Math.round(expoSeconds * 1000));
      setStatus("fin expo");
    } else {
      const tRef = parseFloat(refTimeInput.value);
      const delta = parseFloat(stepInput.value);
      const bandCount = parseInt(bandCountInput.value, 10);
      const orientation = stripOrientationSelect.value;

      if (!Number.isFinite(tRef) || tRef <= 0) {
        setStatus("Tref invalide");
        return;
      }
      if (!Number.isFinite(delta) || delta <= 0) {
        setStatus("Δ invalide");
        return;
      }
      if (!Number.isFinite(bandCount) || bandCount < 2 || bandCount > 20) {
        setStatus("Nb bandes invalide");
        return;
      }

      const times = await runIndependentBandsWithLabels(delayMs, tRef, delta, bandCount, orientation);
      const list = times.map((t) => t.toFixed(1)).join(" / ");
      setStatus(`fin bandes test — temps: ${list} (s)`);
    }
  } finally {
    await endExposureSession();
  }
});

exportBtn.addEventListener("click", () => {
  if (!hasImage || !img.complete || !img.naturalWidth) {
    setStatus("rien à exporter");
    return;
  }

  try {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const rot90 = rotation === 90 || rotation === 270;

    const outW = rot90 ? srcH : srcW;
    const outH = rot90 ? srcW : srcH;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;

    const octx = out.getContext("2d", { willReadFrequently: true });

    octx.save();
    if (rotation === 90) {
      octx.translate(outW, 0);
      octx.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      octx.translate(outW, outH);
      octx.rotate(Math.PI);
    } else if (rotation === 270) {
      octx.translate(0, outH);
      octx.rotate(-Math.PI / 2);
    }

    if (mirrored) {
      octx.translate(srcW, 0);
      octx.scale(-1, 1);
    }

    octx.drawImage(img, 0, 0, srcW, srcH);
    octx.restore();

const imageData = octx.getImageData(0, 0, outW, outH);

const processedImageData = processNegativeSpatial(imageData, {
  paperCurveFn: (x) => curveLUT[Math.max(0, Math.min(255, Math.round(x * 255)))] / 255,

  diffusionCompensationEnabled: state.diffusionCompensationEnabled,
  diffusionHighlightThreshold: state.diffusionHighlightThreshold,
  diffusionEdgeStrength: state.diffusionEdgeStrength,
  diffusionAmount: state.diffusionAmount,

  edgeRestoreEnabled: state.edgeRestoreEnabled,
  edgeRestoreAmount: state.edgeRestoreAmount,
  edgeRestoreProtectShadows: state.edgeRestoreProtectShadows,
  edgeRestoreProtectHighlights: state.edgeRestoreProtectHighlights
});

octx.putImageData(processedImageData, 0, 0);

    out.toBlob((blob) => {
      if (!blob) {
        setStatus("export: échec");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "negatif_haute_resolution.png";
      a.click();
      setStatus("export PNG OK");
    }, "image/png");
  } catch (err) {
    setStatus(`export: ${err.message}`);
  }
});

toggleControlsBtn.addEventListener("click", () => {
  controls.classList.toggle("hidden");
  toggleControlsBtn.textContent = controls.classList.contains("hidden") ? "Afficher" : "Masquer";
});

canvas.addEventListener("click", () => {
  if (isExposing) return;
  controls.classList.toggle("hidden");
  toggleControlsBtn.textContent = controls.classList.contains("hidden") ? "Afficher" : "Masquer";
});

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", async () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (err) {
      setStatus(`fullscreen: ${err.message}`);
    }
  });
}

setStatus("prêt (charge une image)");
