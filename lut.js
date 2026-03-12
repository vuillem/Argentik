// lut.js

export function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildIdentityLUT() {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
}

function buildParametricLUT({ gamma = 1.0, toe = 0.0, shoulder = 0.0 } = {}) {
  const lut = new Uint8Array(256);

  for (let i = 0; i < 256; i++) {
    let x = i / 255;

    if (toe > 0) x = x + toe * (x * (1 - x));
    x = Math.pow(Math.max(0, x), gamma);
    if (shoulder > 0) x = x - shoulder * (x * (1 - x));

    lut[i] = clamp255(x * 255);
  }

  return lut;
}

function buildPointsLUT(points) {
  const lut = new Uint8Array(256);

  const pts = (points || [])
    .map(([x, y]) => [clamp255(x), clamp255(y)])
    .sort((a, b) => a[0] - b[0]);

  if (pts.length === 0) return buildIdentityLUT();

  for (let i = 0; i <= pts[0][0]; i++) {
    lut[i] = pts[0][1];
  }

  for (let p = 0; p < pts.length - 1; p++) {
    const [x0, y0] = pts[p];
    const [x1, y1] = pts[p + 1];
    const span = Math.max(1, x1 - x0);

    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / span;
      lut[x] = clamp255(lerp(y0, y1, t));
    }
  }

  const [lastX, lastY] = pts[pts.length - 1];
  for (let i = lastX; i < 256; i++) {
    lut[i] = lastY;
  }

  return lut;
}

// Presets pensés pour le NOUVEAU pipeline :
// positif -> inversion -> LUT -> affichage écran
//
// La courbe "paperCurve01" reprend l’allure de la courbe que tu as montrée,
// avec une approximation manuelle de ses points.
// Information issue de connaissances internes.
export const CURVE_PRESETS = {
  neutral: {
    label: "Neutre",
    type: "identity"
  },

  paperCurve01: {
    label: "Courbe papier 01",
    type: "points",
    points: [
      [0, 158],
      [36, 112],
      [84, 59],
      [158, 26],
      [235, 0],
      [255, 0]
    ]
  },

  paperCurveSoft: {
    label: "Courbe papier doux",
    type: "points",
    points: [
      [0, 168],
      [38, 122],
      [90, 68],
      [165, 30],
      [242, 4],
      [255, 0]
    ]
  },

  paperCurveContrast: {
    label: "Courbe papier contrastée",
    type: "points",
    points: [
      [0, 145],
      [28, 96],
      [72, 44],
      [145, 16],
      [225, 0],
      [255, 0]
    ]
  },

  soft: {
    label: "Doux paramétrique",
    type: "param",
    gamma: 0.90,
    toe: 0.12,
    shoulder: 0.12
  }
};

export function buildCurveLUT(name) {
  const preset = CURVE_PRESETS[name] || CURVE_PRESETS.neutral;

  if (preset.type === "identity") {
    return buildIdentityLUT();
  }

  if (preset.type === "points") {
    return buildPointsLUT(preset.points);
  }

  if (preset.type === "param") {
    return buildParametricLUT(preset);
  }

  return buildIdentityLUT();
}

export function ensureCurvePresetOptions(selectEl) {
  if (!selectEl) return;

  const existingValues = new Set(
    Array.from(selectEl.options).map(opt => opt.value)
  );

  for (const [value, preset] of Object.entries(CURVE_PRESETS)) {
    if (!existingValues.has(value)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = preset.label;
      selectEl.appendChild(opt);
    }
  }

  if (!CURVE_PRESETS[selectEl.value]) {
    selectEl.value = "neutral";
  }
}
