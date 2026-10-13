import { renderSketchPixels, type SketchOptions } from "./sketch-renderer";
import SketchWorker from "./sketch.worker?worker";

export async function renderSketchInWorker(
  image: ImageData,
  options: SketchOptions,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const original = image.data;
  try {
    return await new Promise<Uint8ClampedArray>((resolve, reject) => {
      const worker = new SketchWorker();
      const cleanup = () => { signal.removeEventListener("abort", abort); worker.terminate(); window.clearTimeout(timeout); };
      const abort = () => { cleanup(); reject(new DOMException("스케치 만들기를 취소했어요.", "AbortError")); };
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Worker timeout")); }, 30_000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{ pixels?: ArrayBuffer; error?: string }>) => {
        cleanup();
        if (data.pixels) resolve(new Uint8ClampedArray(data.pixels));
        else reject(new Error(data.error || "스케치를 만들지 못했어요."));
      };
      worker.onerror = () => { cleanup(); reject(new Error("Worker unavailable")); };
      // Transfer a copy so a browser that blocks workers can still use the local recovery path.
      const copy = original.slice();
      worker.postMessage({ pixels: copy.buffer, width: image.width, height: image.height, options }, [copy.buffer]);
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return renderSketchPixels(original, image.width, image.height, options, async () => {
      signal.throwIfAborted();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      signal.throwIfAborted();
    });
  }
}
