export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export type SupportedImageExtension = "jpg" | "png" | "webp";

export type ValidatedImage = {
  file: File;
  mimeType: SupportedImageMimeType;
  extension: SupportedImageExtension;
};

export class ImageValidationError extends Error {
  readonly status: 400 | 413 | 415;
  readonly code:
    | "EMPTY_IMAGE"
    | "IMAGE_TOO_LARGE"
    | "UNSUPPORTED_IMAGE_TYPE"
    | "IMAGE_SIGNATURE_MISMATCH";

  constructor(
    message: string,
    status: 400 | 413 | 415,
    code: ImageValidationError["code"],
  ) {
    super(message);
    this.name = "ImageValidationError";
    this.status = status;
    this.code = code;
  }
}

function declaredMimeType(file: File): SupportedImageMimeType | null {
  const mimeType = file.type.split(";", 1)[0]?.trim().toLowerCase();

  if (mimeType === "image/jpg") return "image/jpeg";
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  ) {
    return mimeType;
  }

  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function detectImageMimeType(
  bytes: Uint8Array,
): SupportedImageMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (
    startsWith(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function extensionForMimeType(
  mimeType: SupportedImageMimeType,
): SupportedImageExtension {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

/** Validates both the browser-supplied MIME type and the file's magic bytes. */
export async function validateUploadedImage(file: File): Promise<ValidatedImage> {
  if (file.size === 0) {
    throw new ImageValidationError(
      "비어 있는 이미지 파일은 사용할 수 없습니다.",
      400,
      "EMPTY_IMAGE",
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      "이미지는 최대 10MB까지 업로드할 수 있습니다.",
      413,
      "IMAGE_TOO_LARGE",
    );
  }

  const declared = declaredMimeType(file);
  if (!declared) {
    throw new ImageValidationError(
      "JPG, PNG 또는 WEBP 이미지 파일만 사용할 수 있습니다.",
      415,
      "UNSUPPORTED_IMAGE_TYPE",
    );
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectImageMimeType(header);
  if (!detected || detected !== declared) {
    throw new ImageValidationError(
      "이미지 형식과 파일 내용이 일치하지 않습니다.",
      415,
      "IMAGE_SIGNATURE_MISMATCH",
    );
  }

  return {
    file,
    mimeType: detected,
    extension: extensionForMimeType(detected),
  };
}
