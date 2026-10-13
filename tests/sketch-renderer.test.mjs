import assert from "node:assert/strict";
import test from "node:test";
import { renderSketchPixels } from "../lib/sketch-renderer.ts";
import { buildSketchPrompt } from "../lib/sketch-style.ts";

const width = 120, height = 90;
const source = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    source.set(x < 60 ? [64, 137, 184, 255] : [70, 117, 59, 255], i);
  }
}

test("preserves the photo and produces grayscale pencil at 0%", async () => {
  const untouched = source.slice();
  const pencil = await renderSketchPixels(source, width, height, { style: "pencil", colorStrength: 70 });
  const zero = await renderSketchPixels(source, width, height, { style: "watercolor", colorStrength: 0 });
  assert.deepEqual(pencil, zero);
  assert.deepEqual(source, untouched);
  assert.equal(pencil.length, source.length);
  for (let i = 0; i < pencil.length; i += 4) {
    assert.equal(pencil[i], pencil[i + 1]);
    assert.equal(pencil[i], pencil[i + 2]);
    assert.equal(pencil[i + 3], 255);
  }
});

test("30, 70 and 100% produce progressively stronger watercolor pigments", async () => {
  let lastChroma = -1;
  for (const colorStrength of [30, 70, 100]) {
    const result = await renderSketchPixels(source, width, height, { style: "watercolor", colorStrength });
    const pixel = Array.from(result.slice((45 * width + 30) * 4, (45 * width + 30) * 4 + 3));
    const chroma = Math.max(...pixel) - Math.min(...pixel);
    assert.ok(chroma > lastChroma);
    lastChroma = chroma;
  }
});

test("handles transparent photos, tiny dimensions and all retained styles", async () => {
  const transparent = await renderSketchPixels(new Uint8ClampedArray(source.length), width, height,
    { style: "watercolor", colorStrength: 70 });
  assert.ok(transparent[(45 * width + 30) * 4] > 240);
  for (const [w, h] of [[1, 1], [1, 25], [25, 1]]) {
    for (const style of ["pencil", "watercolor", "ink", "charcoal"]) {
      const result = await renderSketchPixels(new Uint8ClampedArray(w * h * 4), w, h, { style, colorStrength: 70 });
      assert.equal(result.length, w * h * 4);
    }
  }
});

test("cooperative recovery can cancel before publishing a stale preview", async () => {
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(renderSketchPixels(source, width, height,
    { style: "watercolor", colorStrength: 70 }, async () => {
      if (++yields === 2) controller.abort();
      controller.signal.throwIfAborted();
    }), { name: "AbortError" });
});

test("AI instructions use the selected medium, preserve composition and reserve poem text for the app", () => {
  const watercolor = buildSketchPrompt("산 정상의 시원한 바람", "오늘의 시", "watercolor", 70);
  assert.match(watercolor, /색감 강도 70%/);
  assert.match(watercolor, /가로세로 비율/);
  assert.match(watercolor, /별도로 얹습니다/);
  assert.match(buildSketchPrompt("", "", "watercolor", 0), /흑백/);
  assert.doesNotMatch(buildSketchPrompt("", "", "watercolor", 0), /색감 강도/);
  assert.doesNotMatch(buildSketchPrompt("", "", "unknown", Number.NaN), /NaN/);
});
