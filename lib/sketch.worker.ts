import { renderSketchPixels, type SketchOptions } from "./sketch-renderer";

type SketchRequest = { pixels: ArrayBuffer; width: number; height: number; options: SketchOptions };
const scope = (typeof self !== "undefined" ? self : null) as unknown as {
  onmessage: ((event: MessageEvent<SketchRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

if (scope && typeof document === "undefined") scope.onmessage = async ({ data }) => {
  try {
    const pixels = await renderSketchPixels(new Uint8ClampedArray(data.pixels), data.width, data.height, data.options);
    scope.postMessage({ pixels: pixels.buffer }, [pixels.buffer]);
  } catch {
    scope.postMessage({ error: "스케치를 만들지 못했어요. 다른 사진으로 다시 시도해 주세요." });
  }
};

// Vite's ?worker import replaces this module with a compiled Worker constructor.
// Other bundlers can use the same interface with cooperative browser-local processing.
export default class CooperativeSketchWorker {
  onmessage: ((event: MessageEvent<{ pixels?: ArrayBuffer; error?: string }>) => void) | null = null;
  onerror: (() => void) | null = null;
  private stopped = false;

  terminate() { this.stopped = true; }

  postMessage(data: SketchRequest) {
    void renderSketchPixels(new Uint8ClampedArray(data.pixels), data.width, data.height, data.options, async () => {
      if (this.stopped) throw new DOMException("Cancelled", "AbortError");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }).then((pixels) => {
      if (!this.stopped) this.onmessage?.({ data: { pixels: pixels.buffer } } as MessageEvent<{ pixels: ArrayBuffer }>);
    }).catch(() => { if (!this.stopped) this.onerror?.(); });
  }
}
