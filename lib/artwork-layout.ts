export type ArtworkText = { title: string; poem: string; location: string };
export type TextPlacement = {
  x: number; y: number; width: number; fontScale: number;
  color: string; align: "left" | "center" | "right"; backdrop: number;
};
export type ArtworkLayout = {
  x: number; y: number; width: number; height: number; padding: number;
  fontSize: number; titleSize: number; lineHeight: number;
  titleLines: string[]; poemLines: string[]; footerLines: string[];
};
type MeasureContext = { font: string; measureText(text: string): { width: number } };
export const POEM_FONT = '"Noto Serif KR", "Nanum Myeongjo", Batang, serif';
export const DEFAULT_PLACEMENT: TextPlacement = {
  x: 0.05, y: 0.07, width: 0.42, fontScale: 1,
  color: "#233f36", align: "left", backdrop: 0,
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Wrap all characters, including long Korean words, and preserve stanza breaks.
export function wrapArtworkText(context: MeasureContext, text: string, width: number): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && context.measureText(line + character).width > width) {
        const space = line.lastIndexOf(" ");
        if (space > line.length * 0.4) {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1) + character;
        } else {
          lines.push(line.trimEnd());
          line = character.trimStart();
        }
      } else line += character;
    }
    lines.push(line.trimEnd());
    return lines;
  });
}

export function layoutArtworkText(
  context: MeasureContext, width: number, height: number,
  text: ArtworkText, placement: TextPlacement,
): ArtworkLayout {
  const insetX = width * 0.025, insetY = height * 0.025;
  const boxWidth = width * clamp(placement.width, 0.28, 0.95);
  const padding = Math.min(width, height) * 0.018;
  const contentWidth = Math.max(1, boxWidth - padding * 2);
  const maxHeight = height - insetY * 2;
  const measure = (fontSize: number) => {
    const titleSize = fontSize * 1.48;
    context.font = `600 ${titleSize}px ${POEM_FONT}`;
    const titleLines = wrapArtworkText(context, text.title, contentWidth);
    context.font = `400 ${fontSize}px ${POEM_FONT}`;
    const poemLines = wrapArtworkText(context, text.poem, contentWidth);
    context.font = `400 ${fontSize * 0.58}px ${POEM_FONT}`;
    const footerLines = wrapArtworkText(context, text.location.trim() || "오늘의 산책", contentWidth);
    const lineHeight = fontSize * 1.6;
    const boxHeight = padding * 2 + titleLines.length * titleSize * 1.3 + fontSize * 0.9
      + poemLines.length * lineHeight + fontSize * 0.85 + footerLines.length * fontSize * 0.9;
    return { titleSize, titleLines, poemLines, footerLines, lineHeight, boxHeight };
  };
  const desiredSize = Math.min(width, height) * 0.028 * clamp(placement.fontScale, 0.65, 1.7);
  let fontSize = desiredSize;
  let measured = measure(fontSize);
  if (measured.boxHeight > maxHeight) {
    // Fit the entire poem, never slice lines or replace the ending with an ellipsis.
    let low = 0.01, high = desiredSize;
    for (let iteration = 0; iteration < 22; iteration++) {
      const middle = (low + high) / 2;
      if (measure(middle).boxHeight <= maxHeight) low = middle;
      else high = middle;
    }
    fontSize = low;
    measured = measure(fontSize);
  }
  return {
    x: clamp(placement.x * width, insetX, width - boxWidth - insetX),
    y: clamp(placement.y * height, insetY, height - measured.boxHeight - insetY),
    width: boxWidth, height: measured.boxHeight, padding, fontSize,
    titleSize: measured.titleSize, lineHeight: measured.lineHeight,
    titleLines: measured.titleLines, poemLines: measured.poemLines, footerLines: measured.footerLines,
  };
}

// The editor canvas and the exported PNG use exactly the same layout and pixels.
export function paintArtworkText(context: CanvasRenderingContext2D, layout: ArtworkLayout, placement: TextPlacement) {
  const { x, y, width, height, padding, fontSize, titleSize } = layout;
  context.save();
  if (placement.backdrop > 0) {
    context.fillStyle = `rgba(251,249,243,${clamp(placement.backdrop, 0, 85) / 100})`;
    context.fillRect(x, y, width, height);
  }
  context.fillStyle = placement.color;
  context.textBaseline = "top";
  context.textAlign = placement.align;
  context.shadowColor = placement.color === "#ffffff" ? "rgba(20,36,30,.6)" : "rgba(255,255,255,.65)";
  context.shadowBlur = fontSize * 0.07;
  const textX = placement.align === "center" ? x + width / 2
    : placement.align === "right" ? x + width - padding : x + padding;
  let cursor = y + padding;
  context.font = `600 ${titleSize}px ${POEM_FONT}`;
  for (const line of layout.titleLines) {
    context.fillText(line, textX, cursor);
    cursor += titleSize * 1.3;
  }
  cursor += fontSize * 0.9;
  context.font = `400 ${fontSize}px ${POEM_FONT}`;
  for (const line of layout.poemLines) {
    context.fillText(line, textX, cursor);
    cursor += layout.lineHeight;
  }
  cursor += fontSize * 0.85;
  context.globalAlpha = 0.8;
  context.font = `400 ${fontSize * 0.58}px ${POEM_FONT}`;
  for (const line of layout.footerLines) {
    context.fillText(line, textX, cursor);
    cursor += fontSize * 0.9;
  }
  context.restore();
}
