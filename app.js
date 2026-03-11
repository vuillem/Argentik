function $(id) { return document.getElementById(id); }

// --- UI / DOM ---
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const controls = $("controls");
const toggleControlsBtn = $("toggleControlsBtn");
const fullscreenBtn = $("fullscreenBtn");

const fileInput = $("fileInput");
const exposeBtn = $("exposeBtn");
const exportBtn = $("exportBtn");

const modeSelect = $("modeSelect");

const expoInput = $("expoTime");
const delayInput = $("delayTime");

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

// --- Diagnostics ---
function setStatus(msg) {
  if (statusEl) statusEl.textContent = `Statut : ${msg}`;
}
window.addEventListener("error", (e) => setStatus(`ERREUR JS: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => setStatus(`PROMISE REJETÉE: ${String(e.reason)}`));

// Vérification IDs
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

let rotation = 0;     // 0, 90, 180, 270
let mirrored = true;  // ON par défaut

// Offscreen (image prête)
let processed = {
  ready: false,
  off: document.createElement("canvas"),
  offCtx: null,
  x: 0, y: 0, w: 0, h: 0
};
processed.offCtx = processed.off.getContext("2d", { willReadFrequently: true });

// --- Utils ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clamp255(v) { return Math.max(0, Math.min(255, v)); }

function blackScreen() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Cacher TOUT pendant expo (menu + topbar + statut)
function enterExposureMode() {
  controls.classList.add("hidden");
  if (topBar) topBar.style.display = "none";
  if (statusEl) statusEl.textContent = "";
}
function exitExposureMode() {
  if (topBar) topBar.style.display = "";
  controls.classList.remove("hidden");
}

// iOS Safari sizing : visualViewport si dispo
function resizeCanvas() {
  const vv = window.visualViewport;
  canvas.width = vv ? Math.round(vv.width) : window.innerWidth;
  canvas.height = vv ? Math.round(vv.height) : window.innerHeight;

  blackScreen();
  if (hasImage && img.complete && img.naturalWidth) {
    buildProcessedImage();
    drawProcessedFull();
  }
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 250));
if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeCanvas);
resizeCanvas();

function playBip(durationSec = 0.18, freq = 880, gainVal = 0.08) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const audioCtx = new AudioCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = gainVal;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + durationSec);
}

// --- Courbe (LUT) ---
function applyToneCurve(x01, gamma = 1.0, toe = 0.0, shoulder = 0.0) {
  let x = x01;
  if (toe > 0) x = x + toe * (x * (1 - x));
  x = Math.pow(Math.max(0, x), gamma);
  if (shoulder > 0) x = x - shoulder * (x * (1 - x));
  return Math.max(0, Math.min(1, x));
}

function buildCurveLUT(preset) {
  const lut = new Uint8Array(256);
  let gamma = 1.0, toe = 0.0, shoulder = 0.0;

  switch (preset) {
    case "soft":               gamma = 0.80; toe = 0.18; shoulder = 0.18; break;
    case "softer":             gamma = 0.70; toe = 0.26; shoulder = 0.26; break;
    case "liftShadows":        gamma = 0.82; toe = 0.34; shoulder = 0.10; break;
    case "compressHighlights": gamma = 0.88; toe = 0.10; shoulder = 0.34; break;
    case "flat":               gamma = 0.62; toe = 0.34; shoulder = 0.34; break;
    case "neutral":
    default:                   gamma = 1.0;  toe = 0.0;  shoulder = 0.0;  break;
  }

  for (let i = 0; i < 256; i++) {
    const y01 = applyToneCurve(i / 255, gamma, toe, shoulder);
    lut[i] = clamp255(Math.round(y01 * 255));
  }
  return lut;
}

let curveLUT = buildCurveLUT(curvePresetSelect.value);

curvePresetSelect.addEventListener("change", () => {
  curveLUT = buildCurveLUT(curvePresetSelect.value);
  if (hasImage && img.complete && img.naturalWidth) {
    buildProcessedImage();
    drawProcessedFull();
  }
  setStatus(`courbe: ${curvePresetSelect.value}`);
});

// --- Rotation / miroir ---
function normRot(d) { return ((d % 360) + 360) % 360; }
function updateRotUI(){ rotValue.textContent = `${rotation}°`; }

mirrorBtn.addEventListener("click", () => {
  mirrored = !mirrored;
  if (hasImage && img.complete && img.naturalWidth) { buildProcessedImage(); drawProcessedFull(); }
  setStatus(mirrored ? "miroir: ON" : "miroir: OFF");
});

rotLeftBtn.addEventListener("click", () => {
  rotation = normRot(rotation - 90);
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth) { buildProcessedImage(); drawProcessedFull(); }
});

rotRightBtn.addEventListener("click", () => {
  rotation = normRot(rotation + 90);
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth) { buildProcessedImage(); drawProcessedFull(); }
});

rotResetBtn.addEventListener("click", () => {
  rotation = 0;
  updateRotUI();
  if (hasImage && img.complete && img.naturalWidth) { buildProcessedImage(); drawProcessedFull(); }
});

updateRotUI();

// --- Build image prête (rotation+miroir + NB + courbe + inversion) ---
function buildProcessedImage() {
  processed.ready = false;

  const rot90 = (rotation === 90 || rotation === 270);
  const effW = rot90 ? img.height : img.width;
  const effH = rot90 ? img.width  : img.height;

  const scale = Math.min(canvas.width / effW, canvas.height / effH);
  const w = Math.floor(effW * scale);
  const h = Math.floor(effH * scale);
  const x = Math.floor((canvas.width - w) / 2);
  const y = Math.floor((canvas.height - h) / 2);

  processed.x = x; processed.y = y; processed.w = w; processed.h = h;
  processed.off.width = w;
  processed.off.height = h;

  const octx = processed.offCtx;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, w, h);

  const drawW = rot90 ? h : w;
  const drawH = rot90 ? w : h;

  octx.save();
  octx.translate(w / 2, h / 2);
  octx.rotate(rotation * Math.PI / 180);
  if (mirrored) octx.scale(-1, 1);
  octx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  octx.restore();

  const imageData = octx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = clamp255(Math.round(gray));
    gray = curveLUT[gray];
    gray = 255 - gray;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  octx.putImageData(imageData, 0, 0);
  processed.ready = true;
}

function drawProcessedFull() {
  blackScreen();
  if (!processed.ready) return;
  ctx.drawImage(processed.off, processed.x, processed.y, processed.w, processed.h);
}

// --- Bandes : calcul des bornes d’une bande (dans l’espace canvas) ---
function getBandRect(bandIndex, totalBands, orientation) {
  if (orientation === "vertical") {
    const bandW = processed.w / totalBands;
    const x0 = Math.floor(processed.x + bandW * bandIndex);
    const x1 = Math.floor(processed.x + bandW * (bandIndex + 1));
    return { x: x0, y: processed.y, w: Math.max(1, x1 - x0), h: processed.h };
  } else {
    const bandH = processed.h / totalBands;
    const y0 = Math.floor(processed.y + bandH * bandIndex);
    const y1 = Math.floor(processed.y + bandH * (bandIndex + 1));
    return { x: processed.x, y: y0, w: processed.w, h: Math.max(1, y1 - y0) };
  }
}

// --- Dessin 1 bande SEULEMENT + LABEL exposé (cartouche blanc sur papier) ---
function drawProcessedSingleBandWithLabel(bandIndex, totalBands, orientation, labelText) {
  blackScreen();
  if (!processed.ready) return;

  // Image déjà "baked" (rotation + miroir + courbe + négatif)
  ctx.drawImage(processed.off, processed.x, processed.y, processed.w, processed.h);

  // Masque tout sauf la bande
  ctx.fillStyle = "black";
  const band = getBandRect(bandIndex, totalBands, orientation);

  if (orientation === "vertical") {
    if (band.x > processed.x) ctx.fillRect(processed.x, processed.y, band.x - processed.x, processed.h);
    const rightX = band.x + band.w;
    const rightW = (processed.x + processed.w) - rightX;
    if (rightW > 0) ctx.fillRect(rightX, processed.y, rightW, processed.h);
  } else {
    if (band.y > processed.y) ctx.fillRect(processed.x, processed.y, processed.w, band.y - processed.y);
    const bottomY = band.y + band.h;
    const bottomH = (processed.y + processed.h) - bottomY;
    if (bottomH > 0) ctx.fillRect(processed.x, bottomY, processed.w, bottomH);
  }

  // --- LABEL : cartouche noir (=> blanc sur papier) + texte blanc (=> noir sur papier)
  const pad = Math.max(6, Math.floor(Math.min(band.w, band.h) * 0.08));
  const fontPx = Math.max(18, Math.min(56, Math.floor(Math.min(band.w, band.h) * 0.22)));

  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `700 ${fontPx}px -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;

  const text = String(labelText);
  const metrics = ctx.measureText(text);
  const boxW = Math.ceil(metrics.width + pad * 2);
  const boxH = Math.ceil(fontPx + pad * 1.4);

  // Position : coin haut-gauche DE LA BANDE (pas ailleurs)
  const bx = band.x + pad;
  const by = band.y + pad;

  // Cartouche "non exposé" (noir écran)
  ctx.fillStyle = "black";
  ctx.fillRect(bx, by, boxW, boxH);

  // Texte "exposé" (blanc écran) : si image miroir, on miroir le texte DANS le cartouche
  ctx.fillStyle = "white";

  if (mirrored) {
    // miroir des glyphes autour de l’axe vertical au centre du cartouche
    const x0 = bx + boxW / 2;
    ctx.save();
    ctx.translate(2 * x0, 0);
    ctx.scale(-1, 1);

    // pour que le texte se retrouve bien à gauche après miroir :
    // on le dessine à l'abscisse symétrique (bx + boxW - pad)
    ctx.fillText(text, bx + boxW - pad, by + Math.floor(pad * 0.5));
    ctx.restore();
  } else {
    ctx.fillText(text, bx + pad, by + Math.floor(pad * 0.5));
  }

  ctx.restore();
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

// --- Import image (fiable iOS) ---
fileInput.addEventListener("change", (e) => {
  try {
    const file = e.target.files && e.target.files[0];
    if (!file) { setStatus("aucun fichier sélectionné"); return; }

    setStatus("lecture fichier…");

    const reader = new FileReader();
    reader.onerror = () => setStatus("erreur FileReader");
    reader.onload = (event) => {
      const newImg = new Image();
      newImg.onload = () => {
        img = newImg;
        hasImage = true;
        buildProcessedImage();
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

// --- Exposition ---
async function runFullExposure(delayMs, expoMs) {
  blackScreen();
  await sleep(delayMs);
  drawProcessedFull();
  await sleep(expoMs);
  blackScreen();
  playBip();
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

    drawProcessedSingleBandWithLabel(i, bandCount, orientation, label);
    await sleep(Math.round(t * 1000));

    blackScreen();
    await sleep(blinkMs);
  }

  blackScreen();
  playBip(0.22, 880, 0.08);
  await sleep(delayMs);

  return times;
}

exposeBtn.addEventListener("click", async () => {
  if (isExposing) return;
  if (!hasImage) { setStatus("importe une image d'abord"); return; }

  buildProcessedImage();

  const delaySeconds = parseFloat(delayInput.value);
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) { setStatus("délai invalide"); return; }
  const delayMs = Math.round(delaySeconds * 1000);

  isExposing = true;
  enterExposureMode();

  try {
    if (modeSelect.value === "full") {
      const expoSeconds = parseFloat(expoInput.value);
      if (!Number.isFinite(expoSeconds) || expoSeconds <= 0) { exitExposureMode(); setStatus("temps expo invalide"); return; }

      await runFullExposure(delayMs, Math.round(expoSeconds * 1000));

      exitExposureMode();
      setStatus("fin expo");
    } else {
      const tRef = parseFloat(refTimeInput.value);
      const delta = parseFloat(stepInput.value);
      const bandCount = parseInt(bandCountInput.value, 10);
      const orientation = stripOrientationSelect.value;

      if (!Number.isFinite(tRef) || tRef <= 0) { exitExposureMode(); setStatus("Tref invalide"); return; }
      if (!Number.isFinite(delta) || delta <= 0) { exitExposureMode(); setStatus("Δ invalide"); return; }
      if (!Number.isFinite(bandCount) || bandCount < 2 || bandCount > 20) { exitExposureMode(); setStatus("Nb bandes invalide"); return; }

      const times = await runIndependentBandsWithLabels(delayMs, tRef, delta, bandCount, orientation);

      exitExposureMode();
      const list = times.map(t => t.toFixed(1)).join(" / ");
      setStatus(`fin bandes test — temps: ${list} (s)`);
    }
  } finally {
    isExposing = false;
  }
});

// --- Export PNG haute résolution ---
exportBtn.addEventListener("click", () => {
  if (!hasImage || !img.complete || !img.naturalWidth) {
    setStatus("rien à exporter");
    return;
  }

  try {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const rot90 = (rotation === 90 || rotation === 270);

    const outW = rot90 ? srcH : srcW;
    const outH = rot90 ? srcW : srcH;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;

    const octx = out.getContext("2d", { willReadFrequently: true });

    octx.save();
    if (rotation === 90) { octx.translate(outW, 0); octx.rotate(Math.PI / 2); }
    else if (rotation === 180) { octx.translate(outW, outH); octx.rotate(Math.PI); }
    else if (rotation === 270) { octx.translate(0, outH); octx.rotate(-Math.PI / 2); }

    if (mirrored) { octx.translate(srcW, 0); octx.scale(-1, 1); }

    octx.drawImage(img, 0, 0, srcW, srcH);
    octx.restore();

    const imageData = octx.getImageData(0, 0, outW, outH);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;
      gray = clamp255(Math.round(gray));
      gray = curveLUT[gray];
      gray = 255 - gray;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    octx.putImageData(imageData, 0, 0);

    out.toBlob((blob) => {
      if (!blob) { setStatus("export: échec"); return; }
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

// --- UI extras ---
toggleControlsBtn.addEventListener("click", () => {
  controls.classList.toggle("hidden");
  toggleControlsBtn.textContent = controls.classList.contains("hidden") ? "Afficher" : "Masquer";
});
canvas.addEventListener("click", () => {
  if (isExposing) return;
  controls.classList.toggle("hidden");
  toggleControlsBtn.textContent = controls.classList.contains("hidden") ? "Afficher" : "Masquer";
});

// Fullscreen (Android/desktop; iPhone Safari peut ignorer)
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