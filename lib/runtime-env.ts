export const DEFAULT_GOOGLE_DRIVE_FOLDER_ID =
  "1THA5WVItE6BFJKsOX3It7dHZQErrqc8s";

export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";

export type RuntimeEnvName =
  | "OPENAI_API_KEY"
  | "OPENAI_TEXT_MODEL"
  | "OPENAI_IMAGE_MODEL"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_PICKER_API_KEY"
  | "GOOGLE_PICKER_APP_ID"
  | "GOOGLE_DRIVE_FOLDER_ID";

function cleanEnvValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const cleaned = value.trim();
  return cleaned || undefined;
}

/**
 * Reads runtime text bindings in both Cloudflare/vinext and ordinary Node.js
 * builds. The worker enables `nodejs_compat`; current Cloudflare runtimes
 * populate configured text/secret bindings in `process.env` at request time.
 */
export function getRuntimeEnv(name: RuntimeEnvName): string | undefined {
  if (typeof process === "undefined") return undefined;
  return cleanEnvValue(process.env[name]);
}

export function getGoogleDriveFolderId(): string {
  return (
    getRuntimeEnv("GOOGLE_DRIVE_FOLDER_ID") ??
    DEFAULT_GOOGLE_DRIVE_FOLDER_ID
  );
}

export function getGoogleDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
