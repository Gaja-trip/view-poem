export type SketchStyle = "pencil" | "watercolor" | "ink" | "charcoal";
export type SketchOptions = { style: SketchStyle; colorStrength: number };

const clamp = (n: number, low = 0, high = 255) => Math.max(low, Math.min(high, n));
const smoothstep = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const red = (rgb: number) => (rgb >>> 16) & 255;
const green = (rgb: number) => (rgb >>> 8) & 255;
const blue = (rgb: number) => rgb & 255;
const luminance = (rgb: number) => (77 * red(rgb) + 150 * green(rgb) + 29 * blue(rgb)) >>> 8;

function noise(x: number, y: number) {
  let hash = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1274126177) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) & 0xffff) / 32767.5 - 1;
}

function pigmentNoise(x: number, y: number) {
  const cx = Math.floor(x / 24), cy = Math.floor(y / 24);
  const tx = smoothstep((x % 24) / 24), ty = smoothstep((y % 24) / 24);
  const upper = noise(cx, cy) * (1 - tx) + noise(cx + 1, cy) * tx;
  const lower = noise(cx, cy + 1) * (1 - tx) + noise(cx + 1, cy + 1) * tx;
  return upper * (1 - ty) + lower * ty;
}

function hatch(x: number, y: number, shadow: number) {
  const primary = Math.abs((x + y + noise(Math.floor(x / 19), Math.floor(y / 17))) % 6 - 3);
  const secondary = Math.abs((x - y + 10000) % 7 - 3.5);
  return (primary < 0.7 ? Math.max(0, shadow - 0.2) : 0)
    + (secondary < 0.55 ? Math.max(0, shadow - 0.65) : 0);
}

type YieldTurn = (() => Promise<void>) | undefined;

// Run in a Web Worker by default. The cooperative yield also supports older browsers.
export async function renderSketchPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: SketchOptions,
  yieldTurn?: YieldTurn,
): Promise<Uint8ClampedArray> {
  if (width < 1 || height < 1 || width * height * 4 !== rgba.length) {
    throw new Error("사진 크기를 확인하지 못했어요.");
  }
  const colored = options.style === "watercolor" && options.colorStrength > 0;
  const strength = clamp(options.colorStrength, 0, 100) / 100;
  const count = width * height;
  const gray = new Uint8Array(count);
  let colors = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4, alpha = rgba[p + 3] / 255;
    const r = Math.round(rgba[p] * alpha + 255 * (1 - alpha));
    const g = Math.round(rgba[p + 1] * alpha + 255 * (1 - alpha));
    const b = Math.round(rgba[p + 2] * alpha + 255 * (1 - alpha));
    colors[i] = (r << 16) | (g << 8) | b;
    gray[i] = luminance(colors[i]);
  }
  const weights = new Float32Array(256);
  for (let i = 0; i < 256; i++) weights[i] = 1 / (1 + (i / 24) ** 2);
  let next = new Uint32Array(count);
  for (let pass = 0; pass < (colored ? 6 : 2); pass++) {
    const brush = colored ? Math.max(1, Math.round(Math.min(width, height) / 270)) : 1;
    for (let y = 0; y < height; y++) {
      if (yieldTurn && (y & 31) === 0) await yieldTurn();
      const up = Math.max(0, y - brush) * width, down = Math.min(height - 1, y + brush) * width;
      for (let x = 0; x < width; x++) {
        const i = y * width + x, center = colors[i];
        const l = colors[y * width + Math.max(0, x - brush)];
        const r = colors[y * width + Math.min(width - 1, x + brush)];
        const t = colors[up + x], b = colors[down + x];
        const weight = (color: number) => weights[Math.floor((Math.abs(red(center) - red(color))
          + Math.abs(green(center) - green(color)) + Math.abs(blue(center) - blue(color))) / 3)];
        const wl = weight(l), wr = weight(r), wt = weight(t), wb = weight(b);
        const total = 1 + wl + wr + wt + wb;
        const rr = Math.round((red(center) + red(l) * wl + red(r) * wr + red(t) * wt + red(b) * wb) / total);
        const gg = Math.round((green(center) + green(l) * wl + green(r) * wr + green(t) * wt + green(b) * wb) / total);
        const bb = Math.round((blue(center) + blue(l) * wl + blue(r) * wr + blue(t) * wt + blue(b) * wb) / total);
        next[i] = (rr << 16) | (gg << 8) | bb;
      }
    }
    [colors, next] = [next, colors];
  }
  // Pencil detail comes from the sharp original, not the softened color wash.
  if (!colored) for (let i = 0; i < count; i++) gray[i] = luminance(colors[i]);
  const radius = Math.max(3, Math.min(14, Math.floor(Math.min(width, height) / 65)));
  const window = radius * 2 + 1;
  const horizontal = new Uint8Array(count), blurred = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    if (yieldTurn && (y & 31) === 0) await yieldTurn();
    const row = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) sum += gray[row + clamp(dx, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = Math.floor(sum / window);
      sum += gray[row + clamp(x + radius + 1, 0, width - 1)] - gray[row + clamp(x - radius, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    if (yieldTurn && (x & 31) === 0) await yieldTurn();
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) sum += horizontal[clamp(dy, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      blurred[y * width + x] = Math.floor(sum / window);
      sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x]
        - horizontal[clamp(y - radius, 0, height - 1) * width + x];
    }
  }
  const lifted = new Float32Array(256);
  for (let i = 0; i < 256; i++) lifted[i] = 255 * (i / 255) ** 0.9;
  const output = new Uint8ClampedArray(rgba.length);
  const margin = Math.max(1, Math.min(width, height) * (colored ? 0.006 : 0.035));
  const strokeScale = Math.max(0.65, Math.min(width, height) / 700);
  for (let y = 0; y < height; y++) {
    if (yieldTurn && (y & 31) === 0) await yieldTurn();
    for (let x = 0; x < width; x++) {
      const i = y * width + x, tone = gray[i], shadow = 1 - tone / 255;
      const dodge = Math.min(1, tone / Math.max(1, blurred[i]));
      let edge = 0;
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1]
          + 2 * gray[i + 1] - gray[i + width - 1] + gray[i + width + 1];
        const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
          + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
        edge = clamp(((Math.abs(gx) + Math.abs(gy)) / 8 - 5) / 65, 0, 1);
      }
      const line = Math.min(0.75, (1 - dodge) * (colored ? 0.95 : 0.82) + edge * (colored ? 0.6 : 0.26));
      const texture = noise(x, y) * 1.8 + noise(Math.floor(x / 3), Math.floor(y / 2)) * 0.8;
      const shading = hatch(x / strokeScale, y / strokeScale, shadow);
      const border = smoothstep(Math.min(x, y, width - 1 - x, height - 1 - y) / margin);
      const p = i * 4;
      if (colored) {
        const lr = lifted[red(colors[i])], lg = lifted[green(colors[i])], lb = lifted[blue(colors[i])];
        const neutral = (77 * lr + 150 * lg + 29 * lb) / 256;
        // Keep chromatic shadows: a gray underpainting makes the whole scene muddy.
        const wash = strength * (0.96 + pigmentNoise(x, y) * 0.08);
        const graphite = Math.min(0.4, line * 0.8 + shading * 0.04);
        const channel = (color: number, paper: number) => {
          let pigment = clamp(neutral + (color - neutral) * 1.24);
          pigment = pigment * 0.55 + Math.round(pigment / 24) * 24 * 0.45;
          const value = (paper + (pigment - paper) * wash) * (1 - graphite) + texture;
          // Only a fine paper edge, not a white fog across the photograph.
          return clamp(Math.round(paper + (value - paper) * (0.9 + border * 0.1)));
        };
        output[p] = channel(lr, 251); output[p + 1] = channel(lg, 249); output[p + 2] = channel(lb, 244);
      } else {
        let graphite = Math.min(0.83, line * 0.9 + shadow ** 2 * 0.35 + shading * 0.10);
        if (options.style === "charcoal") graphite = Math.min(0.94, graphite * 1.32 + shadow * 0.1);
        if (options.style === "ink") graphite = Math.min(0.9, edge > 0.16 ? line * 1.7 : line * 0.55 + shadow ** 3 * 0.12);
        const grain = options.style === "charcoal" ? texture * 2.2 : texture;
        const value = clamp(Math.round(250 + (-graphite * 235 + grain) * border));
        output[p] = value; output[p + 1] = value; output[p + 2] = value;
      }
      output[p + 3] = 255;
    }
  }
  return output;
}
