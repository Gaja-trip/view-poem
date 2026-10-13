import type { SketchStyle } from "./sketch-renderer";

export function buildSketchPrompt(feeling: string, poem: string, style: string, colorStrength = 90) {
  const strength = Number.isFinite(colorStrength) ? Math.max(0, Math.min(100, colorStrength)) : 90;
  const selected: SketchStyle = ["pencil", "watercolor", "ink", "charcoal"].includes(style)
    ? style as SketchStyle : "watercolor";
  const descriptions: Record<SketchStyle, string> = {
    pencil: "실제 흑연 연필로 그린 섬세한 흑백 그림. 방향감 있는 연필선, 겹친 해칭, 부드러운 명암과 지우개로 밝힌 하이라이트를 표현합니다.",
    watercolor: `색감 강도 ${strength}%. 여행 스케치북에 그린 아름다운 컬러 수채화처럼 원본의 하늘색, 생기 있는 초록, 따뜻한 흙빛을 분명하게 살립니다. 투명한 색을 여러 겹 쌓고 밝은 부분에만 종이의 흰색을 남깁니다. 전체를 회색으로 만들거나 흰 안개처럼 흐리게 덮지 마세요. 은은한 색 번짐, 선명한 주요 형태, 섬세한 연필선이 함께 보이도록 합니다.`,
    ink: "절제된 먹선, 담백한 여백과 수묵의 가벼운 번짐을 표현합니다.",
    charcoal: "목탄의 거친 결, 깊은 명암, 손으로 문지른 번짐과 부드러운 하이라이트를 표현합니다.",
  };
  const effectiveStyle = selected === "watercolor" && strength === 0 ? "pencil" : selected;
  return [
    "입력 사진을 따뜻한 미색 종이 위에 직접 그린 손그림 스케치 작품으로 바꾸세요.",
    "원본의 전체 구도, 가로세로 비율, 시점, 인물의 수와 얼굴, 자세, 건물과 지형의 형태, 빛의 방향을 유지하세요.",
    descriptions[effectiveStyle],
    "미세한 종이 섬유와 흑연 입자, 자연스럽게 겹친 선을 살리되 거친 디지털 윤곽선이나 과도한 대비는 피하세요.",
    "풍경은 화면 끝까지 채우고, 흰 테두리나 사진 액자, 별도의 글상자는 그리지 마세요.",
    "앱에서 제목과 시를 별도로 얹습니다. 사용자가 글씨를 자유롭게 옮길 수 있도록 특정 영역을 지우거나 희게 덮지 말고 전체 풍경을 완성하세요.",
    "새로운 사물, 사람, 글자, 시, 서명, 직인, 워터마크, 로고를 추가하지 마세요.",
    feeling ? `작품 분위기 참고: ${feeling.slice(0, 800)}` : "",
    poem ? `함께 놓일 시의 분위기 참고: ${poem.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n");
}
