import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PLACEMENT, layoutArtworkText, paintArtworkText, wrapArtworkText } from "../lib/artwork-layout.ts";

function context() {
  return { font: "16px serif", measureText(text) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 16);
    return { width: Array.from(text).reduce((sum, ch) => sum + (/[가-힣]/.test(ch) ? size : size * 0.55), 0) };
  } };
}
const compact = (text) => text.replace(/\s/g, "");

test("long titles and poems keep every character and stanza; nothing is ellipsized", () => {
  const title = "숲을 지나 물빛으로 내려앉은 오래도록 간직하고 싶은 아름다운 하루 ".repeat(4);
  const poem = Array.from({ length: 48 }, (_, i) => i % 5 === 0 ? "" : `시의 ${i}번째 줄, 바람을 따라 마음이 머무는 풍경 안으로 걸어가요`).join("\n");
  for (const [width, height] of [[1400, 950], [950, 1400], [1500, 400]]) {
    const layout = layoutArtworkText(context(), width, height, { title, poem, location: "산책길" }, DEFAULT_PLACEMENT);
    assert.equal(compact(layout.titleLines.join("")), compact(title));
    assert.equal(compact(layout.poemLines.join("")), compact(poem));
    assert.ok(layout.poemLines.includes(""));
    assert.ok(layout.y + layout.height <= height * 0.975 + 0.01);
    assert.ok(layout.fontSize > 0);
  }
});

test("the text box stays inside landscape and portrait images after arbitrary dragging/resizing", () => {
  for (const [width, height] of [[1400, 950], [950, 1400]]) {
    for (const [x, y] of [[-2, -1], [1.5, 3], [0.1, 0.3]]) {
      const layout = layoutArtworkText(context(), width, height, { title: "오늘의 산책", poem: "바람이 머무는 곳\n나도 잠시 머문다", location: "숲" },
        { ...DEFAULT_PLACEMENT, x, y, width: 0.9 });
      assert.ok(layout.x >= width * 0.025);
      assert.ok(layout.y >= height * 0.025);
      assert.ok(layout.x + layout.width <= width * 0.975 + 0.01);
      assert.ok(layout.y + layout.height <= height * 0.975 + 0.01);
    }
  }
});

test("canvas export paints every measured line at the user's position, without a compulsory white panel", () => {
  const ctx = context(), painted = [], panels = [];
  Object.assign(ctx, { save() {}, restore() {}, fillText(...args) { painted.push(args); }, fillRect(...args) { panels.push(args); } });
  const placement = { ...DEFAULT_PLACEMENT, x: 0.55, y: 0.45, align: "right" };
  const layout = layoutArtworkText(ctx, 1400, 950, { title: "물빛", poem: "첫 줄\n\n마지막 줄까지", location: "호수" }, placement);
  paintArtworkText(ctx, layout, placement);
  assert.deepEqual(painted.map(([line]) => line), [...layout.titleLines, ...layout.poemLines, ...layout.footerLines]);
  assert.equal(panels.length, 0);
  assert.ok(painted[0][1] > 700);
  paintArtworkText(ctx, layout, { ...placement, backdrop: 25 });
  assert.deepEqual(panels[0], [layout.x, layout.y, layout.width, layout.height]);
});

test("single unbroken Korean text and emoji wrap without dropping characters", () => {
  const text = "초록빛을따라끝없이걸어가는아름다운산책🌿".repeat(10);
  assert.equal(wrapArtworkText(context(), text, 90).join(""), text);
});
