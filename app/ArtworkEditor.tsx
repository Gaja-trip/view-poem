"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import {
  DEFAULT_PLACEMENT, layoutArtworkText, paintArtworkText, POEM_FONT,
  type ArtworkLayout, type ArtworkText, type TextPlacement,
} from "@/lib/artwork-layout";

type Props = {
  sketchUrl: string; originalUrl: string; showOriginal: boolean;
  text: ArtworkText; onTextChange: (text: Pick<ArtworkText, "title" | "poem">) => void;
  onArtworkReady: (blob: Blob | null) => void;
};
const COLORS = [
  { label: "짙은 초록", value: "#233f36" }, { label: "먹색", value: "#252a30" },
  { label: "따뜻한 갈색", value: "#633e2b" }, { label: "흰색", value: "#ffffff" },
];

export default function ArtworkEditor({ sketchUrl, originalUrl, showOriginal, text, onTextChange, onArtworkReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [placement, setPlacement] = useState<TextPlacement>(DEFAULT_PLACEMENT);
  const [layout, setLayout] = useState<ArtworkLayout | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 900 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const source = new window.Image();
    onArtworkReady(null);
    setReady(false);
    setError("");
    source.onload = async () => {
      try {
        await document.fonts.load(`400 24px ${POEM_FONT}`);
        await document.fonts.load(`600 24px ${POEM_FONT}`);
        if (stopped) return;
        const scale = Math.min(1, 1500 / Math.max(source.naturalWidth, source.naturalHeight),
          Math.sqrt(1_900_000 / (source.naturalWidth * source.naturalHeight)));
        setSize({ width: Math.max(1, Math.round(source.naturalWidth * scale)), height: Math.max(1, Math.round(source.naturalHeight * scale)) });
        setPlacement({ ...DEFAULT_PLACEMENT, width: source.naturalWidth > source.naturalHeight ? 0.42 : 0.72 });
        setImage(source);
      } catch {
        if (!stopped) setError("글씨를 준비하지 못했어요. 다시 만들기를 눌러주세요.");
      }
    };
    source.onerror = () => { if (!stopped) setError("그림을 읽지 못했어요. 다시 만들기를 눌러주세요."); };
    source.src = sketchUrl;
    return () => { stopped = true; source.onload = null; source.onerror = null; source.src = ""; };
  }, [sketchUrl, onArtworkReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) { setError("작품을 표시하지 못했어요."); return; }
    let stopped = false;
    onArtworkReady(null);
    setReady(false);
    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(image, 0, 0, size.width, size.height);
    const nextLayout = layoutArtworkText(context, size.width, size.height, text, placement);
    paintArtworkText(context, nextLayout, placement);
    setLayout(nextLayout);
    // Serialize only after moving stops. Cancel callbacks from superseded layouts.
    const timer = window.setTimeout(() => {
      if (dragging) return;
      canvas.toBlob((blob) => {
        if (stopped) return;
        onArtworkReady(blob);
        setReady(Boolean(blob));
        setError(blob ? "" : "저장할 이미지를 만들지 못했어요. 글씨 위치를 다시 조정해 주세요.");
      }, "image/png");
    }, 160);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [image, size, placement, text.title, text.poem, text.location, dragging, onArtworkReady]);

  function updatePlacement(next: Partial<TextPlacement>) {
    onArtworkReady(null);
    setReady(false);
    setPlacement((current) => ({ ...current, ...next }));
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!layout || showOriginal) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      startX: layout.x / size.width, startY: layout.y / size.height };
    onArtworkReady(null);
    setReady(false);
    setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect || !layout) return;
    // Convert CSS pixels to image coordinates, independent of phone/desktop size.
    const x = drag.startX + (event.clientX - drag.x) / rect.width;
    const y = drag.startY + (event.clientY - drag.y) / rect.height;
    updatePlacement({
      x: Math.max(0.025, Math.min(1 - layout.width / size.width - 0.025, x)),
      y: Math.max(0.025, Math.min(1 - layout.height / size.height - 0.025, y)),
    });
  }
  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }
  function moveByKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!layout || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 0.04 : 0.01;
    updatePlacement({
      x: layout.x / size.width + (event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0),
      y: layout.y / size.height + (event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0),
    });
  }

  return (
    <div className="artwork-editor">
      <div className="editor-caption"><span>나만의 한 장</span><button type="button" className="editor-zoom" aria-pressed={zoomed} onClick={() => setZoomed((current) => !current)}>{zoomed ? "전체 보기" : "크게 보고 배치"}</button></div>
      <div className={`editor-viewport${zoomed ? " is-zoomed" : ""}`}>
      <div className="artwork-image editor-surface" ref={surfaceRef} style={{ aspectRatio: size.width / size.height, width: zoomed ? "200%" : "100%" }}>
        <canvas ref={canvasRef} aria-label={`${text.title}. ${text.poem}`} />
        {showOriginal && originalUrl ? <img className="editor-original" src={originalUrl} alt="원본 풍경" /> : null}
        {layout && !showOriginal ? (
          <button type="button" className={`poem-drag-target${dragging ? " is-dragging" : ""}`}
            aria-label="시 글상자 위치 이동: 끌거나 방향키를 눌러 옮기기" aria-describedby="placement-help"
            style={{ left: `${layout.x / size.width * 100}%`, top: `${layout.y / size.height * 100}%`,
              width: `${layout.width / size.width * 100}%`, height: `${layout.height / size.height * 100}%` }}
            onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag}
            onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} onKeyDown={moveByKeyboard}>
            <span className="drag-label" aria-hidden="true">✥ 글씨 이동</span>
          </button>
        ) : null}
      </div>
      </div>
      <p className="editor-help" id="placement-help">글씨를 손가락이나 마우스로 옮겨주세요. 점선은 저장되지 않아요.</p>
      <fieldset className="placement-controls" disabled={showOriginal}>
        <legend>글씨 배치</legend>
        <div className="placement-presets">
          {[
            { label: "왼쪽 위", x: 0.05, y: 0.06 }, { label: "오른쪽 위", x: 0.95 - placement.width, y: 0.06 },
            { label: "왼쪽 아래", x: 0.05, y: 0.94 - (layout?.height || 0) / size.height },
            { label: "오른쪽 아래", x: 0.95 - placement.width, y: 0.94 - (layout?.height || 0) / size.height },
          ].map(({ label, x, y }) => <button type="button" key={label} onClick={() => updatePlacement({ x, y })}>{label}</button>)}
        </div>
        <div className="placement-sliders">
          <label>글씨 크기 <output>{Math.round(placement.fontScale * 100)}%</output>
            <input aria-label="글씨 크기" type="range" min="65" max="170" value={Math.round(placement.fontScale * 100)} onChange={(e) => updatePlacement({ fontScale: Number(e.target.value) / 100 })} />
          </label>
          <label>글상자 너비 <output>{Math.round(placement.width * 100)}%</output>
            <input aria-label="글상자 너비" type="range" min="28" max="90" value={Math.round(placement.width * 100)} onChange={(e) => updatePlacement({ width: Number(e.target.value) / 100 })} />
          </label>
        </div>
        <div className="placement-row">
          <div className="text-colors" aria-label="글씨 색상">
            {COLORS.map(({ label, value }) => <button type="button" key={value} title={label} aria-label={`${label} 글씨`} aria-pressed={placement.color === value}
              style={{ backgroundColor: value }} onClick={() => updatePlacement({ color: value })} />)}
          </div>
          <label className="align-control">정렬 <select aria-label="글씨 정렬" value={placement.align} onChange={(e) => updatePlacement({ align: e.target.value as TextPlacement["align"] })}>
            <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
          </select></label>
        </div>
        <label className="backdrop-control">글씨 뒤 밝은 배경 <output>{placement.backdrop}%</output>
          <input aria-label="글씨 뒤 밝은 배경" type="range" min="0" max="85" step="5" value={placement.backdrop} onChange={(e) => updatePlacement({ backdrop: Number(e.target.value) })} />
        </label>
      </fieldset>
      <details className="poem-text-editor">
        <summary>제목과 시 전체 확인 · 수정</summary>
        <label>제목<input value={text.title} maxLength={180} onChange={(e) => { onArtworkReady(null); onTextChange({ title: e.target.value, poem: text.poem }); }} /></label>
        <label>시<textarea value={text.poem} maxLength={6000} rows={8} onChange={(e) => { onArtworkReady(null); onTextChange({ title: text.title, poem: e.target.value }); }} /></label>
      </details>
      <p className="editor-status" role="status">{error || (showOriginal ? "원본 비교 중 · 저장 파일에는 스케치와 시가 담겨요." : ready ? "배치 완료 · 지금 보이는 위치 그대로 저장돼요." : "배치한 작품을 준비하고 있어요…")}</p>
    </div>
  );
}
