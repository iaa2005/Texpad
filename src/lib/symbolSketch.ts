import { ALL_SYMBOLS, type SymbolEntry } from "./symbols";

/**
 * Offline "draw a symbol" search (latexted / Detexify style).
 *
 * Every catalogue glyph is rendered once into a small normalised bitmap.
 * A sketch is normalised the same way and compared with each template by a
 * symmetric chamfer distance: how far the sketch's ink lies from the
 * template's ink and vice versa, plus a small penalty when the aspect ratios
 * differ. No model or network is needed.
 */

export type Stroke = Array<{ x: number; y: number }>;

const N = 32;
const MARGIN = 2;

interface Shape {
  ink: Uint8Array;
  dist: Float32Array;
  aspect: number;
}

interface Template extends Shape {
  entry: SymbolEntry;
}

let templates: Template[] | null = null;

/** Two-pass 3-4 chamfer distance transform over an N×N grid. */
function distanceTransform(ink: Uint8Array): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) d[i] = ink[i] ? 0 : INF;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - N] + 3);
        if (x > 0) d[i] = Math.min(d[i], d[i - N - 1] + 4);
        if (x < N - 1) d[i] = Math.min(d[i], d[i - N + 1] + 4);
      }
    }
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x;
      if (x < N - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < N - 1) {
        d[i] = Math.min(d[i], d[i + N] + 3);
        if (x < N - 1) d[i] = Math.min(d[i], d[i + N + 1] + 4);
        if (x > 0) d[i] = Math.min(d[i], d[i + N - 1] + 4);
      }
    }
  }
  for (let i = 0; i < N * N; i++) d[i] /= 3;
  return d;
}

function inkOf(canvas: HTMLCanvasElement): Uint8Array {
  const data = canvas.getContext("2d")!.getImageData(0, 0, N, N).data;
  const ink = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) ink[i] = data[i * 4 + 3] > 70 ? 1 : 0;
  return ink;
}

/** Fits a bounding box into the N×N cell, keeping its aspect ratio. */
function fitTransform(minX: number, minY: number, width: number, height: number) {
  const span = Math.max(width, height, 1e-6);
  const scale = (N - 2 * MARGIN) / span;
  const offsetX = (N - width * scale) / 2 - minX * scale;
  const offsetY = (N - height * scale) / 2 - minY * scale;
  return { scale, offsetX, offsetY };
}

function shapeFromCanvas(canvas: HTMLCanvasElement, aspect: number): Shape {
  const ink = inkOf(canvas);
  return { ink, dist: distanceTransform(ink), aspect };
}

function renderGlyph(glyph: string): Shape | null {
  const SIZE = 160;
  const big = document.createElement("canvas");
  big.width = SIZE;
  big.height = SIZE;
  const ctx = big.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `96px "Cambria Math", "Segoe UI Symbol", "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(glyph, SIZE / 2, SIZE / 2);
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (data[(y * SIZE + x) * 4 + 3] > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  // Dots and small operators (·, ∘, °) would be blown up to full size and
  // match any round sketch, so they are left out of drawing search.
  if (Math.max(width, height) < 34) return null;
  const small = document.createElement("canvas");
  small.width = N;
  small.height = N;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  const { scale, offsetX, offsetY } = fitTransform(minX, minY, width, height);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(big, minX, minY, width, height, minX * scale + offsetX, minY * scale + offsetY, width * scale, height * scale);
  return shapeFromCanvas(small, width / height);
}

function renderStrokes(strokes: Stroke[]): Shape | null {
  const points = strokes.flat();
  if (points.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { scale, offsetX, offsetY } = fitTransform(minX, minY, width, height);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * scale + offsetX, stroke[0].y * scale + offsetY);
    for (const point of stroke.slice(1)) {
      ctx.lineTo(point.x * scale + offsetX, point.y * scale + offsetY);
    }
    if (stroke.length === 1) {
      ctx.arc(stroke[0].x * scale + offsetX, stroke[0].y * scale + offsetY, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  // Dots and dashes have a degenerate box; keep their real proportions.
  return shapeFromCanvas(canvas, width / height);
}

function loadTemplates(): Template[] {
  if (templates) return templates;
  templates = [];
  for (const entry of ALL_SYMBOLS) {
    // Only single code points draw reliably as one shape.
    if (Array.from(entry[0]).length !== 1) continue;
    const shape = renderGlyph(entry[0]);
    if (shape) templates.push({ ...shape, entry });
  }
  return templates;
}

function oneWay(from: Shape, to: Shape): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < N * N; i++) {
    if (from.ink[i]) {
      total += to.dist[i];
      count++;
    }
  }
  return count ? total / count : 99;
}

/** Best-matching catalogue symbols for a sketch, closest first. */
export function matchSketch(strokes: Stroke[], limit = 8): SymbolEntry[] {
  const sketch = renderStrokes(strokes);
  if (!sketch) return [];
  const scored = loadTemplates().map((template) => {
    const aspectPenalty = Math.min(
      3,
      Math.abs(Math.log(Math.max(sketch.aspect, 0.05) / Math.max(template.aspect, 0.05))),
    );
    const score = oneWay(sketch, template) + oneWay(template, sketch) + aspectPenalty * 1.2;
    return { entry: template.entry, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.entry);
}
