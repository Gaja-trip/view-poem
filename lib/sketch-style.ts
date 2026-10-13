import type { SketchStyle } from "./sketch-renderer";

export function buildSketchPrompt(feeling: string, poem: string, style: string, colorStrength = 70) {
  const strength = Number.isFinite(colorStrength) ? Math.max(0, Math.min(100, colorStrength)) : 70;
  const selected: SketchStyle = ["pencil", "watercolor", "ink", "charcoal"].includes(style)
    ? style as SketchStyle : "watercolor";
  const descriptions: Record<SketchStyle, string> = {
    pencil: "실제 흑연 연필로 그린 섬세한 흑백 그림. 방향감 있는 연필선, 겹친 해칭, 부드러운 명암과 지우개로 밝힌 하이라이트를 표현합니다.",
    watercolor: `색감 강도 ${strength}%. 원본의 하늘색, 초록, 흙빛을 살리되 채도를 조금 낮추고 흰색을 섞은 투명한 수채 물감으로 색면을 칠합니다. 색이 종이에 은은하게 스며들고, 그 위에 섬세한 흑연 연필선을 겹칩니다.`,
    ink: "절제된 먹선, 담백한 여백과 수묵의 가벼운 번짐을 표현합니다.",
    charcoal: "목탄의 거친 결, 깊은 명암, 손으로 문지른 번짐과 부드러운 하이라이트를 표현합니다.",
  };
  const effectiveStyle = selected === "watercolor" && strength === 0 ? "pencil" : selected;
  return [
    "입력 사진을 따뜻한 미색 종이 위에 직접 그린 손그림 스케치 작품으로 바꾸세요.",
    "원본의 전체 구도, 가로세로 비율, 시점, 인물의 수와 얼굴, 자세, 건물과 지형의 형태, 빛의 방향을 유지하세요.",
    descriptions[effectiveStyle],
    "미세한 종이 섬유와 흑연 입자, 자연스럽게 겹친 선을 살리되 거친 디지털 윤곽선이나 과도한 대비는 피하세요.",
    "가장자리는 종이색으로 부드럽게 스며들도록 처리하고, 흰 테두리나 사진 액자, 별도의 글상자는 그리지 마세요.",
    "앱에서 제목과 시를 별도로 얹습니다. 핵심 피사체를 지우지 않으면서 왼쪽의 질감과 명암을 부드럽게 정리하세요.",
    "새로운 사물, 사람, 글자, 시, 서명, 직인, 워터마크, 로고를 추가하지 마세요.",
    feeling ? `작품 분위기 참고: ${feeling.slice(0, 800)}` : "",
    poem ? `함께 놓일 시의 분위기 참고: ${poem.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n");
}
