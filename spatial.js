function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function imageDataToGrayFloat(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return { gray, width, height };
}

export function grayFloatToImageData(gray, width, height) {
  const imageData = new ImageData(width, height);
  const { data } = imageData;

  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const v = Math.round(clamp01(gray[i]) * 255);
    data[p] = v;
    data[p + 1] = v;
    data[p + 2] = v;
    data[p + 3] = 255;
  }

  return imageData;
}

export function invertGray(gray) {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = 1 - gray[i];
  }
  return out;
}

export function applyCurveToGray(gray, curveFn) {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = clamp01(curveFn(gray[i]));
  }
  return out;
}

export function blur3x3(src, width, height) {
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;

          if (xx >= 0 && xx < width && yy >= 0 && yy < height) {
            sum += src[yy * width + xx];
            count++;
          }
        }
      }

      out[y * width + x] = sum / count;
    }
  }

  return out;
}

export function diffusionCompensation(src, width, height, options = {}) {
  const {
    highlightThreshold = 0.72,
    edgeStrength = 1.0,
    amount = 0.12
  } = options;

  const blurred = blur3x3(src, width, height);
  const out = new Float32Array(src);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = src[i];

      const highlightMask = clamp01((v - highlightThreshold) / (1 - highlightThreshold));

      const gx = Math.abs(src[i + 1] - src[i - 1]);
      const gy = Math.abs(src[i + width] - src[i - width]);
      const grad = clamp01((gx + gy) * edgeStrength);

      const correction = amount * highlightMask * grad;

      out[i] = clamp01(v - correction);
    }
  }

  return out;
}

export function edgeRestore(src, width, height, options = {}) {
  const {
    amount = 0.08,
    protectShadows = 0.08,
    protectHighlights = 0.92
  } = options;

  const blurred = blur3x3(src, width, height);
  const out = new Float32Array(src.length);

  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    const detail = v - blurred[i];

    const shadowMask = clamp01((v - protectShadows) / 0.25);
    const highlightMask = clamp01((protectHighlights - v) / 0.25);
    const midMask = shadowMask * highlightMask;

    out[i] = clamp01(v + amount * detail * midMask);
  }

  return out;
}

export function processNegativeSpatial(imageData, settings) {
  const { gray, width, height } = imageDataToGrayFloat(imageData);

  let img = invertGray(gray);
  img = applyCurveToGray(img, settings.paperCurveFn);

  if (settings.diffusionCompensationEnabled) {
    img = diffusionCompensation(img, width, height, {
      highlightThreshold: settings.diffusionHighlightThreshold,
      edgeStrength: settings.diffusionEdgeStrength,
      amount: settings.diffusionAmount
    });
  }

  if (settings.edgeRestoreEnabled) {
    img = edgeRestore(img, width, height, {
      amount: settings.edgeRestoreAmount,
      protectShadows: settings.edgeRestoreProtectShadows,
      protectHighlights: settings.edgeRestoreProtectHighlights
    });
  }

  return grayFloatToImageData(img, width, height);
}
