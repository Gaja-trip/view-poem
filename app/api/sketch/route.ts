import {
  ImageValidationError,
  detectImageMimeType,
  validateUploadedImage,
} from "@/lib/image-validation";
import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  getRuntimeEnv,
} from "@/lib/runtime-env";
import { buildSketchPrompt } from "@/lib/sketch-style";

const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function fallbackResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE_HEADERS,
      "X-Sketch-Fallback": "local-filter",
    },
  });
}

function getText(formData: FormData, ...keys: string[]): string {
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getImage(formData: FormData): File | null {
  for (const key of ["image", "photo"]) {
    const value = formData.get(key);
    if (value && typeof value !== "string") return value;
  }
  return null;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extractImageBase64(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const image = (item as { b64_json?: unknown }).b64_json;
    if (typeof image === "string" && image) return image;
  }
  return null;
}


async function createSketch(
  image: Awaited<ReturnType<typeof validateUploadedImage>>,
  formData: FormData,
  apiKey: string,
): Promise<Uint8Array> {
  const body = new FormData();
  const canonicalImage = new Blob([image.file], { type: image.mimeType });
  body.append("model", getRuntimeEnv("OPENAI_IMAGE_MODEL") ?? DEFAULT_OPENAI_IMAGE_MODEL);
  body.append("image[]", canonicalImage, `landscape.${image.extension}`);
  body.append(
    "prompt",
    buildSketchPrompt(
      getText(formData, "feeling", "emotion", "note"),
      getText(formData, "poem"),
      getText(formData, "style"),
      getText(formData, "colorStrength") === "" ? 70 : Number(getText(formData, "colorStrength")),
    ),
  );
  body.append("size", "auto");
  body.append("quality", "medium");

  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`OpenAI Images API returned ${response.status}`);
  }

  const payload: unknown = await response.json();
  const encodedImage = extractImageBase64(payload);
  if (!encodedImage) throw new Error("OpenAI response did not contain an image");

  const bytes = base64ToBytes(encodedImage);
  if (detectImageMimeType(bytes.subarray(0, 12)) !== "image/png") {
    throw new Error("OpenAI response was not a PNG image");
  }
  return bytes;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json(
      {
        error: "multipart/form-data로 풍경 이미지를 보내 주세요.",
        code: "UNSUPPORTED_CONTENT_TYPE",
      },
      { status: 415, headers: NO_STORE_HEADERS },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "업로드 내용을 읽을 수 없습니다.", code: "INVALID_FORM_DATA" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const uploadedImage = getImage(formData);
  if (!uploadedImage) {
    return Response.json(
      { error: "풍경 이미지가 필요합니다.", code: "IMAGE_REQUIRED" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let image: Awaited<ReturnType<typeof validateUploadedImage>>;
  try {
    image = await validateUploadedImage(uploadedImage);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    return Response.json(
      { error: "이미지를 검사하지 못했습니다.", code: "IMAGE_VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const apiKey = getRuntimeEnv("OPENAI_API_KEY");
  if (!apiKey) return fallbackResponse();

  try {
    const sketch = await createSketch(image, formData, apiKey);
    const pngBuffer = new Uint8Array(sketch.byteLength);
    pngBuffer.set(sketch);
    return new Response(pngBuffer.buffer, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="landscape-sketch.png"',
        "X-Sketch-Source": "ai",
      },
    });
  } catch (error) {
    console.warn(
      "OpenAI sketch generation failed; asking the client to use its local filter.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return fallbackResponse();
  }
}
