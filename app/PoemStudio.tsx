"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

type Mode = "create" | "import";
type Step = 1 | 2 | 3;
type SketchStyle = "pencil" | "watercolor" | "ink" | "charcoal";
type PoemLength = "short" | "medium" | "long";

type PoemResult = {
  title: string;
  poem: string;
  source: "openai" | "local";
};

type PublicConfig = {
  aiEnabled: boolean;
  googleDrive: {
    clientId: string;
    pickerApiKey: string;
    appId: string;
    folderId: string;
    folderUrl: string;
    configured: boolean;
  };
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken(options?: { prompt?: string }): void;
};

type GooglePickerView = {
  setIncludeFolders(value: boolean): GooglePickerView;
  setSelectFolderEnabled(value: boolean): GooglePickerView;
  setMimeTypes(value: string): GooglePickerView;
};

type GooglePickerInstance = {
  setVisible(value: boolean): void;
  dispose?(): void;
};

type GooglePickerBuilder = {
  addView(view: GooglePickerView): GooglePickerBuilder;
  setAppId(value: string): GooglePickerBuilder;
  setOAuthToken(value: string): GooglePickerBuilder;
  setDeveloperKey(value: string): GooglePickerBuilder;
  setCallback(callback: (data: Record<string, unknown>) => void): GooglePickerBuilder;
  setTitle(value: string): GooglePickerBuilder;
  build(): GooglePickerInstance;
};

type GooglePickerApi = {
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string; ERROR: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string };
  DocsView: new (viewId: string) => GooglePickerView;
  PickerBuilder: new () => GooglePickerBuilder;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: () => void;
          }): GoogleTokenClient;
        };
      };
      picker?: GooglePickerApi;
    };
    gapi?: {
      load(
        name: string,
        options:
          | (() => void)
          | {
              callback: () => void;
              onerror: () => void;
              timeout: number;
              ontimeout: () => void;
            },
      ): void;
    };
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_FOLDER_URL =
  "https://drive.google.com/drive/folders/1THA5WVItE6BFJKsOX3It7dHZQErrqc8s";
const GENERATION_MESSAGES = [
  "사진 속 빛과 결을 바라보고 있어요.",
  "마음의 결을 시어로 옮기고 있어요.",
  "풍경에 마지막 연필선을 더하고 있어요.",
];
const EMOTIONS = ["고요해요", "따뜻해요", "쓸쓸해요", "설레요", "벅차요", "그리워요"];

const STYLE_LABELS: Record<SketchStyle, string> = {
  pencil: "연필",
  watercolor: "수채 연필",
  ink: "먹선",
  charcoal: "목탄",
};

const LENGTH_LABELS: Record<PoemLength, string> = {
  short: "짧게",
  medium: "보통",
  long: "길게",
};

function validateImage(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return "JPG, PNG, WEBP 이미지 파일을 선택해 주세요.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "이미지는 10MB보다 작아야 해요.";
  }
  return null;
}

function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

function blobFromCanvas(canvas: HTMLCanvasElement, type = "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 만들지 못했어요."));
    }, type);
  });
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했어요."));
    };
    image.src = url;
  });
}

async function createLocalSketch(file: File, style: SketchStyle) {
  const sourceImage = await loadImage(file);
  const maxEdge = 1400;
  const maxPixels = 1_600_000;
  const sourcePixels = sourceImage.naturalWidth * sourceImage.naturalHeight;
  const scale = Math.min(
    1,
    maxEdge / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight),
    Math.sqrt(maxPixels / sourcePixels),
  );
  const width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
  const height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("이 브라우저에서는 스케치를 만들 수 없어요.");
  context.drawImage(sourceImage, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const gray = new Uint8Array(width * height);
  for (let pixel = 0, index = 0; pixel < pixels.length; pixel += 4, index += 1) {
    gray[index] = Math.round(
      pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114,
    );
  }

  const edgeStrength = style === "ink" ? 2.6 : style === "charcoal" ? 2.1 : 1.65;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const pixel = index * 4;
      const left = gray[y * width + Math.max(0, x - 1)];
      const right = gray[y * width + Math.min(width - 1, x + 1)];
      const up = gray[Math.max(0, y - 1) * width + x];
      const down = gray[Math.min(height - 1, y + 1) * width + x];
      const edge = Math.min(255, (Math.abs(right - left) + Math.abs(down - up)) * edgeStrength);
      const shade = 250 - edge * 0.82 - (255 - gray[index]) * 0.1;

      if (style === "watercolor") {
        const wash = 0.3;
        pixels[pixel] = Math.max(0, Math.min(255, shade * (1 - wash) + pixels[pixel] * wash + 8));
        pixels[pixel + 1] = Math.max(
          0,
          Math.min(255, shade * (1 - wash) + pixels[pixel + 1] * wash + 6),
        );
        pixels[pixel + 2] = Math.max(
          0,
          Math.min(255, shade * (1 - wash) + pixels[pixel + 2] * wash),
        );
      } else {
        const grain = style === "charcoal" ? ((x * 17 + y * 11) % 13) - 6 : 0;
        const value = style === "ink" ? (shade < 205 ? shade * 0.72 : 252) : shade + grain;
        pixels[pixel] = Math.max(0, Math.min(255, value + 5));
        pixels[pixel + 1] = Math.max(0, Math.min(255, value + 3));
        pixels[pixel + 2] = Math.max(0, Math.min(255, value - 3));
      }
      pixels[pixel + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  context.globalCompositeOperation = "multiply";
  context.fillStyle = style === "watercolor" ? "rgba(239, 232, 211, .1)" : "rgba(230, 218, 188, .08)";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  const sketch = await blobFromCanvas(canvas);
  canvas.width = 0;
  canvas.height = 0;
  sourceImage.src = "";
  return sketch;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (context.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let fragment = "";
      for (const character of Array.from(word)) {
        const candidate = `${fragment}${character}`;
        if (fragment && context.measureText(candidate).width > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment = candidate;
        }
      }
      current = fragment;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function createArtworkBlob(
  sketch: Blob,
  result: PoemResult,
  location: string,
) {
  const sourceImage = await loadImage(sketch);
  const maxEdge = 1500;
  const maxPixels = 1_900_000;
  const sourcePixels = sourceImage.naturalWidth * sourceImage.naturalHeight;
  const scale = Math.min(
    1,
    maxEdge / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight),
    Math.sqrt(maxPixels / sourcePixels),
  );
  const width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
  const height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("작품 파일을 만들지 못했어요.");

  context.fillStyle = "#eee9dc";
  context.fillRect(0, 0, width, height);
  const imageRatio = sourceImage.naturalWidth / sourceImage.naturalHeight;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;
  if (imageRatio > canvasRatio) {
    drawWidth = height * imageRatio;
    drawX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / imageRatio;
    drawY = (height - drawHeight) / 2;
  }
  context.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

  const panelWidth = width > height ? width * 0.49 : width * 0.84;
  const panelHeight = height * 0.82;
  const panelX = width > height ? width * 0.065 : width * 0.08;
  const panelY = height * 0.09;
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, width * 0.018);
  context.fillStyle = "rgba(250, 247, 238, .9)";
  context.fill();
  context.strokeStyle = "rgba(52, 57, 49, .2)";
  context.lineWidth = Math.max(1, width * 0.0012);
  context.stroke();

  const padding = panelWidth * 0.12;
  const titleSize = Math.max(30, Math.min(58, panelWidth * 0.09));
  context.fillStyle = "#293029";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `600 ${titleSize}px "Noto Serif KR", "Nanum Myeongjo", Batang, serif`;
  const titleLines = wrapText(context, result.title, panelWidth - padding * 2);
  let cursorY = panelY + padding;
  for (const line of titleLines.slice(0, 2)) {
    context.fillText(line, panelX + padding, cursorY);
    cursorY += titleSize * 1.24;
  }

  context.strokeStyle = "rgba(59, 89, 67, .42)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(panelX + padding, cursorY + titleSize * 0.18);
  context.lineTo(panelX + padding + panelWidth * 0.2, cursorY + titleSize * 0.18);
  context.stroke();
  cursorY += titleSize * 0.74;

  let poemSize = Math.max(15, Math.min(36, panelWidth * 0.052));
  context.fillStyle = "#353a35";
  let poemLines: string[] = [];
  let lineHeight = poemSize * 1.72;
  let availableLines = 4;
  do {
    context.font = `400 ${poemSize}px "Noto Serif KR", "Nanum Myeongjo", Batang, serif`;
    lineHeight = poemSize * 1.72;
    poemLines = result.poem.split("\n").flatMap((line) =>
      wrapText(context, line || " ", panelWidth - padding * 2),
    );
    availableLines = Math.max(
      4,
      Math.floor((panelY + panelHeight - padding * 1.35 - cursorY) / lineHeight),
    );
    if (poemLines.length <= availableLines || poemSize <= 15) break;
    poemSize -= 1;
  } while (poemSize >= 15);

  const visiblePoemLines = poemLines.slice(0, availableLines);
  if (poemLines.length > availableLines && visiblePoemLines.length > 0) {
    const lastIndex = visiblePoemLines.length - 1;
    visiblePoemLines[lastIndex] = `${visiblePoemLines[lastIndex].replace(/…?$/, "")}…`;
  }
  for (const line of visiblePoemLines) {
    context.fillText(line, panelX + padding, cursorY);
    cursorY += lineHeight;
  }

  context.font = `500 ${Math.max(15, poemSize * 0.53)}px system-ui, sans-serif`;
  context.fillStyle = "rgba(45, 57, 46, .68)";
  context.fillText(location.trim() ? `풍경시 · ${location.trim()}` : "풍경시 · 오늘의 산책", panelX + padding, panelY + panelHeight - padding * 0.58);

  const artwork = await blobFromCanvas(canvas);
  canvas.width = 0;
  canvas.height = 0;
  sourceImage.src = "";
  return artwork;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFileName(title: string, extension = "png") {
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = title
    .replace(/[^0-9A-Za-z가-힣\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return `${date}_풍경시_${safeTitle || "오늘의-풍경"}.${extension}`;
}

function fileExtension(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  return "png";
}

async function requestPoem(
  photo: File,
  feeling: string,
  emotion: string,
  location: string,
  length: PoemLength,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append("image", photo);
  form.append("feeling", feeling);
  form.append("emotion", emotion);
  form.append("location", location);
  form.append("length", length);
  const response = await fetch("/api/poem", { method: "POST", body: form, signal });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error || "시를 만들지 못했어요.");
  }
  return (await response.json()) as PoemResult;
}

async function requestSketch(
  photo: File,
  feeling: string,
  style: SketchStyle,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append("image", photo);
  form.append("feeling", feeling);
  form.append("style", style);
  try {
    const response = await fetch("/api/sketch", { method: "POST", body: form, signal });
    if (response.ok && response.status !== 204 && response.headers.get("content-type")?.startsWith("image/")) {
      return await response.blob();
    }
  } catch (error) {
    if (signal.aborted) throw error;
    // The local pencil filter below is the intentional offline recovery path.
  }
  if (signal.aborted) throw new DOMException("작품 만들기를 취소했어요.", "AbortError");
  return createLocalSketch(photo, style);
}

function getGoogleAccessToken(clientId: string, prompt: "consent" | "") {
  return new Promise<{ token: string; expiresAt: number }>((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error("Google 연결 도구를 아직 불러오는 중이에요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          const expiresIn = typeof response.expires_in === "number" ? response.expires_in : 3_600;
          resolve({ token: response.access_token, expiresAt: Date.now() + expiresIn * 1_000 });
        }
        else reject(new Error(response.error_description || "Google 계정 연결을 마치지 못했어요."));
      },
      error_callback: () => reject(new Error("Google 로그인 창이 닫혔어요.")),
    });
    client.requestAccessToken({ prompt });
  });
}

function loadGooglePicker() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    if (!window.gapi) {
      reject(new Error("Google Drive 선택기를 아직 불러오는 중이에요."));
      return;
    }
    window.gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("Google Drive 선택기를 불러오지 못했어요.")),
      timeout: 10_000,
      ontimeout: () => reject(new Error("Google Drive 연결 시간이 초과됐어요.")),
    });
  });
}

async function pickGoogleFolder(config: PublicConfig["googleDrive"], token: string) {
  await loadGooglePicker();
  const picker = window.google?.picker;
  if (!picker) throw new Error("Google Drive 선택기를 사용할 수 없어요.");

  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    let instance: GooglePickerInstance | null = null;
    const finish = (
      outcome: { id: string; name: string } | Error,
    ) => {
      instance?.dispose?.();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    instance = new picker.PickerBuilder()
      .addView(view)
      .setAppId(config.appId)
      .setOAuthToken(token)
      .setDeveloperKey(config.pickerApiKey)
      .setTitle("풍경시를 저장할 폴더를 선택해 주세요")
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) {
          finish(new Error("폴더 선택을 취소했어요."));
          return;
        }
        if (action === picker.Action.ERROR) {
          finish(new Error("Google Drive 폴더 선택 중 문제가 생겼어요."));
          return;
        }
        if (action !== picker.Action.PICKED) return;
        const documents = data[picker.Response.DOCUMENTS];
        const first = Array.isArray(documents) ? documents[0] : null;
        if (!first || typeof first !== "object") {
          finish(new Error("선택한 폴더를 확인하지 못했어요."));
          return;
        }
        const document = first as Record<string, unknown>;
        const id = document[picker.Document.ID];
        const name = document[picker.Document.NAME];
        if (typeof id !== "string") {
          finish(new Error("선택한 폴더를 확인하지 못했어요."));
          return;
        }
        finish({ id, name: typeof name === "string" ? name : "지정한 폴더" });
      })
      .build();
    instance.setVisible(true);
  });
}

async function verifyDriveFolder(folderId: string, token: string, signal: AbortSignal) {
  const fields = encodeURIComponent("id,name,mimeType,capabilities(canAddChildren)");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error("이 폴더는 앱에서 아직 선택되지 않았어요.");
  const folder = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    capabilities?: { canAddChildren?: boolean };
  };
  if (folder.mimeType !== "application/vnd.google-apps.folder" || !folder.capabilities?.canAddChildren) {
    throw new Error("이 폴더에 파일을 추가할 권한이 없어요.");
  }
  return folder.name || "지정한 Google Drive 폴더";
}

async function uploadToDrive(
  blob: Blob,
  fileName: string,
  folderId: string,
  token: string,
  signal: AbortSignal,
) {
  const boundary = `view-poem-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: blob.type || "image/png",
    parents: [folderId],
    appProperties: { source: "view-poem" },
  });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || "image/png"}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal,
    },
  );
  if (!response.ok) throw new Error("Google Drive에 파일을 저장하지 못했어요.");
  return (await response.json()) as { id: string; name: string; webViewLink?: string };
}

export default function PoemStudio({ mode }: { mode: Mode }) {
  const [step, setStep] = useState<Step>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [importedImage, setImportedImage] = useState<File | null>(null);
  const [feeling, setFeeling] = useState("");
  const [emotion, setEmotion] = useState("");
  const [location, setLocation] = useState("");
  const [style, setStyle] = useState<SketchStyle>("pencil");
  const [length, setLength] = useState<PoemLength>("medium");
  const [result, setResult] = useState<PoemResult | null>(null);
  const [sketchBlob, setSketchBlob] = useState<Blob | null>(null);
  const [artworkBlob, setArtworkBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationIndex, setGenerationIndex] = useState(0);
  const [error, setError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [pickerScriptLoaded, setPickerScriptLoaded] = useState(false);
  const [googleScriptError, setGoogleScriptError] = useState(false);
  const [driveState, setDriveState] = useState<"idle" | "connecting" | "saving" | "saved" | "error">("idle");
  const [driveMessage, setDriveMessage] = useState("");
  const [driveFileUrl, setDriveFileUrl] = useState("");
  const studioRef = useRef<HTMLElement>(null);
  const generationIdRef = useRef(0);
  const generationAbortRef = useRef<AbortController | null>(null);
  const driveAbortRef = useRef<AbortController | null>(null);
  const googleTokenRef = useRef<{ token: string; expiresAt: number } | null>(null);

  const photoUrl = useObjectUrl(photo);
  const importedImageUrl = useObjectUrl(importedImage);
  const sketchUrl = useObjectUrl(sketchBlob);
  const googleScriptsReady = identityLoaded && pickerScriptLoaded;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((nextConfig: PublicConfig) => setConfig(nextConfig))
      .catch(() => {
        if (controller.signal.aborted) return;
        setConfig({
          aiEnabled: false,
          googleDrive: {
            clientId: "",
            pickerApiKey: "",
            appId: "",
            folderId: "1THA5WVItE6BFJKsOX3It7dHZQErrqc8s",
            folderUrl: DEFAULT_FOLDER_URL,
            configured: false,
          },
        });
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      generationAbortRef.current?.abort();
      driveAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => {
      setGenerationIndex((current) => (current + 1) % GENERATION_MESSAGES.length);
    }, 2_400);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  function scrollToStudio() {
    window.requestAnimationFrame(() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function selectPhoto(file: File | undefined, target: Mode) {
    if (!file) return;
    const validationError = validateImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    if (target === "create") {
      setPhoto(file);
      setResult(null);
      setSketchBlob(null);
      setArtworkBlob(null);
    } else {
      setImportedImage(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>, target: Mode) {
    event.preventDefault();
    selectPhoto(event.dataTransfer.files[0], target);
  }

  async function handleGenerate() {
    if (!photo) {
      setError("먼저 풍경 사진을 한 장 담아주세요.");
      setStep(1);
      return;
    }
    if (!feeling.trim() && !emotion) {
      setError("느낌을 한 단어 이상 적거나 마음 태그를 골라주세요.");
      return;
    }

    setError("");
    setDriveMessage("");
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setGenerationIndex(0);
    setIsGenerating(true);
    try {
      const [nextPoem, nextSketch] = await Promise.all([
        requestPoem(photo, feeling.trim(), emotion, location.trim(), length, controller.signal),
        requestSketch(photo, feeling.trim() || emotion, style, controller.signal),
      ]);
      if (controller.signal.aborted || generationId !== generationIdRef.current) return;
      const nextArtwork = await createArtworkBlob(nextSketch, nextPoem, location);
      if (controller.signal.aborted || generationId !== generationIdRef.current) return;
      setResult(nextPoem);
      setSketchBlob(nextSketch);
      setArtworkBlob(nextArtwork);
      setShowOriginal(false);
      setStep(3);
    } catch (generationError) {
      if (controller.signal.aborted || generationId !== generationIdRef.current) return;
      setError(
        generationError instanceof Error
          ? generationError.message
          : "작품을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.",
      );
    } finally {
      if (generationId === generationIdRef.current) {
        generationAbortRef.current = null;
        setIsGenerating(false);
      }
    }
  }

  function resetCreateFlow() {
    generationAbortRef.current?.abort();
    generationIdRef.current += 1;
    setIsGenerating(false);
    setStep(1);
    setPhoto(null);
    setFeeling("");
    setEmotion("");
    setLocation("");
    setResult(null);
    setSketchBlob(null);
    setArtworkBlob(null);
    setError("");
    setDriveMessage("");
    setDriveState("idle");
  }

  async function saveToDrive(blob: Blob, fileName: string) {
    const driveConfig = config?.googleDrive;
    if (!driveConfig?.configured) {
      downloadBlob(blob, fileName);
      const folderUrl = driveConfig?.folderUrl || DEFAULT_FOLDER_URL;
      window.open(folderUrl, "_blank", "noopener,noreferrer");
      setDriveState("saved");
      setDriveMessage("이미지를 내려받았어요. 열린 Google Drive 폴더에 올려주세요.");
      return;
    }
    if (!googleScriptsReady) {
      setDriveState("error");
      setDriveMessage(
        googleScriptError
          ? "Google 연결 도구를 불러오지 못했어요. 네트워크나 콘텐츠 차단 설정을 확인해 주세요."
          : "Google 연결 도구를 불러오는 중이에요. 잠시 후 다시 눌러주세요.",
      );
      return;
    }

    setDriveState("connecting");
    setDriveMessage("Google 계정을 연결하고 있어요.");
    setDriveFileUrl("");
    driveAbortRef.current?.abort();
    const controller = new AbortController();
    driveAbortRef.current = controller;
    try {
      const cachedToken = googleTokenRef.current;
      const tokenRecord =
        cachedToken && cachedToken.expiresAt > Date.now() + 60_000
          ? cachedToken
          : await getGoogleAccessToken(driveConfig.clientId, cachedToken ? "" : "consent");
      if (controller.signal.aborted) return;
      googleTokenRef.current = tokenRecord;
      const token = tokenRecord.token;
      let folderName = "";
      try {
        folderName = await verifyDriveFolder(driveConfig.folderId, token, controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        const selectedFolder = await pickGoogleFolder(driveConfig, token);
        if (controller.signal.aborted) return;
        if (selectedFolder.id !== driveConfig.folderId) {
          throw new Error("처음에 알려주신 Google Drive 폴더를 선택해 주세요.");
        }
        folderName = await verifyDriveFolder(driveConfig.folderId, token, controller.signal);
      }

      if (controller.signal.aborted) return;
      setDriveState("saving");
      setDriveMessage(`${folderName}에 저장하고 있어요.`);
      const uploaded = await uploadToDrive(
        blob,
        fileName,
        driveConfig.folderId,
        token,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDriveState("saved");
      setDriveMessage(`Google Drive에 ‘${uploaded.name}’을 저장했어요.`);
      setDriveFileUrl(uploaded.webViewLink || driveConfig.folderUrl);
    } catch (driveError) {
      if (controller.signal.aborted) return;
      setDriveState("error");
      setDriveMessage(
        driveError instanceof Error ? driveError.message : "Google Drive 저장을 마치지 못했어요.",
      );
    } finally {
      if (driveAbortRef.current === controller) driveAbortRef.current = null;
    }
  }

  function downloadArtwork() {
    if (!artworkBlob || !result) return;
    downloadBlob(artworkBlob, safeFileName(result.title));
  }

  function downloadSketch() {
    if (!sketchBlob || !result) return;
    downloadBlob(sketchBlob, safeFileName(`${result.title}-스케치`));
  }

  const createStepLabel = step === 1 ? "풍경" : step === 2 ? "마음" : "작품";
  const folderUrl = config?.googleDrive.folderUrl || DEFAULT_FOLDER_URL;

  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setIdentityLoaded(true)}
        onReady={() => setIdentityLoaded(Boolean(window.google?.accounts?.oauth2))}
        onError={() => setGoogleScriptError(true)}
      />
      <Script
        id="google-api-loader"
        src="https://apis.google.com/js/api.js"
        strategy="afterInteractive"
        onLoad={() => setPickerScriptLoaded(true)}
        onReady={() => setPickerScriptLoaded(Boolean(window.gapi))}
        onError={() => setGoogleScriptError(true)}
      />

      <header className="site-header">
        <Link className="brand" href="/" aria-label="풍경시 홈">
          <span className="brand-mark" aria-hidden="true">風</span>
          <span>
            <strong>풍경시</strong>
            <small>VIEW · FEEL · VERSE</small>
          </span>
        </Link>
        <Link className="header-action" href={mode === "create" ? "/archive" : "/create"}>
          {mode === "create" ? "이미지 보관" : "새 풍경시"} <span aria-hidden="true">↘</span>
        </Link>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true">✦</span> {mode === "create" ? "산책자의 작은 시집" : "이미지 보관함"}</p>
            <h1 id="hero-title">
              {mode === "create" ? "오늘 본 풍경을," : "마음에 든 이미지를,"}
              <br />
              <em>{mode === "create" ? "한 편의 시로." : "오래 간직해요."}</em>
            </h1>
            <p className="hero-description">
              {mode === "create"
                ? "사진과 그 순간의 마음을 남기면 풍경을 스케치하고, 당신만의 언어로 한 편의 시를 엮어드려요."
                : "ChatGPT에서 내려받은 이미지를 선택해 지정한 Google Drive 폴더에 안전하게 보관하세요."}
            </p>
            <div className="hero-actions">
              <button className="button button-primary button-large" type="button" disabled={isGenerating} onClick={scrollToStudio}>
                {mode === "create" ? "풍경시 만들기 시작" : "이미지 보관 시작"} <span aria-hidden="true">↘</span>
              </button>
              <Link className="button button-quiet button-large" href={mode === "create" ? "/archive" : "/create"}>
                {mode === "create" ? "ChatGPT 이미지 보관하기" : "새 풍경시 만들기"}
              </Link>
            </div>
            <ul className="hero-notes" aria-label="주요 기능">
              <li>사진은 저장하지 않아요</li>
              <li>JPG · PNG · WEBP</li>
              <li>Google Drive 보관</li>
            </ul>
          </div>

          <div className="hero-visual" aria-label="풍경시 스케치북 표지 예시">
            <div className="hero-image-wrap">
              <Image
                src="/og.png"
                alt="산길과 억새가 연필과 수채로 그려진 풍경시 스케치북"
                fill
                priority
                sizes="(max-width: 900px) 92vw, 48vw"
              />
            </div>
            <p className="cover-caption"><span>01</span> {mode === "create" ? <>사진 속 장면은 스케치가 되고<br />마음은 시의 첫 문장이 됩니다.</> : <>좋아하는 이미지를 골라<br />나만의 Drive에 보관합니다.</>}</p>
          </div>
        </section>

        <section className="studio-section" id="studio" ref={studioRef} aria-labelledby="studio-title">
          <div className="section-intro">
            <p className="eyebrow"><span aria-hidden="true">✦</span> {mode === "create" ? "나의 풍경 기록" : "나의 이미지 보관"}</p>
            <h2 id="studio-title">{mode === "create" ? "한 장의 사진에서 시작해요." : "간직할 이미지를 골라주세요."}</h2>
            <p>{mode === "create" ? "지금 사진을 찍어도, 앨범 속 장면을 골라도 좋아요." : "ChatGPT에서 내려받은 JPG, PNG, WEBP 이미지를 선택할 수 있어요."}</p>
          </div>

          <div className="studio-shell">
            <nav className="mode-tabs" aria-label="작업 페이지">
              <Link
                href="/create"
                aria-current={mode === "create" ? "page" : undefined}
                className={mode === "create" ? "mode-tab active" : "mode-tab"}
              >
                새 풍경시
              </Link>
              <Link
                href="/archive"
                aria-current={mode === "import" ? "page" : undefined}
                className={mode === "import" ? "mode-tab active" : "mode-tab"}
              >
                이미지 보관
              </Link>
            </nav>

            {mode === "create" ? (
              <div
                className="flow-panel"
                aria-busy={isGenerating}
              >
                <div className="progress-row" aria-label={`3단계 중 ${step}단계 ${createStepLabel}`}>
                  {[1, 2, 3].map((number) => (
                    <div
                      key={number}
                      className={number <= step ? "progress-step active" : "progress-step"}
                      aria-current={number === step ? "step" : undefined}
                    >
                      <span>{String(number).padStart(2, "0")}</span>
                      <strong>{number === 1 ? "풍경" : number === 2 ? "마음" : "작품"}</strong>
                    </div>
                  ))}
                </div>

                {step === 1 ? (
                  <div className="step-grid">
                    <div className="step-copy">
                      <p className="step-number">STEP 01</p>
                      <h3>어떤 풍경을<br />만났나요?</h3>
                      <p>지금 사진을 찍거나 앨범에 있는 풍경을 골라주세요.</p>
                    </div>
                    <div className="step-content">
                      <label
                        className={photoUrl ? "upload-zone has-image" : "upload-zone"}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(event, "create")}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => selectPhoto(event.target.files?.[0], "create")}
                        />
                        {photoUrl ? (
                          <span className="preview-frame">
                            <Image src={photoUrl} alt="선택한 풍경" fill unoptimized sizes="(max-width: 900px) 88vw, 48vw" />
                            <span className="change-photo">다른 사진 선택</span>
                          </span>
                        ) : (
                          <span className="upload-placeholder">
                            <span className="upload-symbol" aria-hidden="true">⌁</span>
                            <strong>사진 찍기 또는 선택하기</strong>
                            <small>JPG · PNG · WEBP · 최대 10MB</small>
                          </span>
                        )}
                      </label>
                      <button
                        className="button button-primary button-full"
                        type="button"
                        disabled={!photo}
                        onClick={() => {
                          setError("");
                          setStep(2);
                        }}
                      >
                        이 풍경으로 계속하기 <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="step-grid">
                    <div className="step-copy">
                      <p className="step-number">STEP 02</p>
                      <h3>그때 마음에<br />남은 것은?</h3>
                      <p>잘 쓰려고 애쓰지 않아도 괜찮아요. 한 단어면 충분해요.</p>
                      {photoUrl ? (
                        <div className="small-photo">
                          <Image src={photoUrl} alt="선택한 풍경 미리보기" fill unoptimized sizes="180px" />
                        </div>
                      ) : null}
                    </div>
                    <div className="step-content form-stack">
                      <label className="field-label" htmlFor="feeling">그 순간의 느낌</label>
                      <textarea
                        id="feeling"
                        value={feeling}
                        onChange={(event) => setFeeling(event.target.value)}
                        maxLength={600}
                        placeholder="비 온 뒤 젖은 나무 냄새가 오래된 기억처럼 느껴졌다."
                      />
                      <div className="emotion-list" aria-label="마음 태그">
                        {EMOTIONS.map((item) => (
                          <button
                            className={emotion === item ? "emotion-chip selected" : "emotion-chip"}
                            type="button"
                            aria-pressed={emotion === item}
                            key={item}
                            onClick={() => setEmotion((current) => (current === item ? "" : item))}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                      <label className="field-label" htmlFor="location">어디에서 만난 풍경인가요? <span>선택</span></label>
                      <input
                        id="location"
                        className="text-input"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        maxLength={80}
                        placeholder="예: 북한산 둘레길, 집 앞 골목"
                      />
                      <div className="option-grid">
                        <fieldset>
                          <legend>스케치</legend>
                          <div className="segmented-options">
                            {(Object.keys(STYLE_LABELS) as SketchStyle[]).map((key) => (
                              <button
                                type="button"
                                aria-pressed={style === key}
                                className={style === key ? "option-button selected" : "option-button"}
                                key={key}
                                onClick={() => setStyle(key)}
                              >
                                {STYLE_LABELS[key]}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend>시 길이</legend>
                          <div className="segmented-options compact">
                            {(Object.keys(LENGTH_LABELS) as PoemLength[]).map((key) => (
                              <button
                                type="button"
                                aria-pressed={length === key}
                                className={length === key ? "option-button selected" : "option-button"}
                                key={key}
                                onClick={() => setLength(key)}
                              >
                                {LENGTH_LABELS[key]}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                      <div className="button-row">
                        <button className="button button-secondary" type="button" onClick={() => setStep(1)}>이전</button>
                        <button
                          className="button button-primary grow"
                          type="button"
                          disabled={isGenerating}
                          onClick={handleGenerate}
                        >
                          {isGenerating ? "작품을 만드는 중…" : "시와 스케치 만들기"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 3 && result && sketchUrl ? (
                  <div className="result-layout">
                    <div className="result-heading">
                      <p className="step-number">STEP 03</p>
                      <h3>당신의 풍경시가<br />완성됐어요.</h3>
                      <p>
                        {result.source === "openai"
                          ? "사진과 마음을 함께 읽어 만든 한 편이에요."
                          : "지금은 기기 안에서 스케치하고 기본 시어로 엮었어요."}
                      </p>
                    </div>
                    <div className="artwork-card">
                      <div className="artwork-image">
                        <Image
                          src={showOriginal && photoUrl ? photoUrl : sketchUrl}
                          alt={showOriginal ? "원본 풍경" : "스케치로 바뀐 풍경"}
                          fill
                          unoptimized
                          sizes="(max-width: 900px) 88vw, 52vw"
                        />
                        <div className="poem-paper">
                          <span className="poem-kicker">풍경시</span>
                          <h4>{result.title}</h4>
                          <p>{result.poem}</p>
                          <small>{location.trim() || "오늘의 산책"}</small>
                        </div>
                      </div>
                      <div className="result-tools">
                        <button type="button" onClick={() => setShowOriginal((current) => !current)}>
                          {showOriginal ? "스케치 보기" : "원본과 비교"}
                        </button>
                        <button type="button" onClick={() => setStep(2)}>시 다듬기</button>
                        <button type="button" onClick={handleGenerate} disabled={isGenerating}>다시 만들기</button>
                      </div>
                    </div>
                    <div className="save-panel">
                      <p className="save-eyebrow">SAVE YOUR MOMENT</p>
                      <h4>이 순간을 오래 보관해요.</h4>
                      <button className="button button-primary button-full" type="button" onClick={downloadArtwork}>
                        완성 작품 다운로드 <span aria-hidden="true">↓</span>
                      </button>
                      <button className="button button-drive button-full" type="button" onClick={() => artworkBlob && saveToDrive(artworkBlob, safeFileName(result.title))} disabled={driveState === "connecting" || driveState === "saving"}>
                        {driveState === "connecting" || driveState === "saving" ? "Google Drive 저장 중…" : "Google Drive에 저장"}
                      </button>
                      <button className="text-button" type="button" onClick={downloadSketch}>스케치 이미지만 받기</button>
                      <button className="text-button" type="button" onClick={resetCreateFlow}>새 풍경시 만들기</button>
                    </div>
                  </div>
                ) : null}

                {isGenerating ? (
                  <div className="generation-overlay" role="status" aria-live="polite">
                    <div className="pencil-loader" aria-hidden="true"><span /></div>
                    <strong>{GENERATION_MESSAGES[generationIndex]}</strong>
                    <p>완성되면 이 화면에 작품이 나타나요.</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className="flow-panel import-panel"
              >
                <div className="import-copy">
                  <p className="step-number">KEEP AN IMAGE</p>
                  <h3>이미 만들어 둔<br />이미지가 있나요?</h3>
                  <p>ChatGPT에서 내려받은 이미지를 선택하면 지정한 Google Drive 폴더에 그대로 보관해요.</p>
                </div>
                <div className="import-content">
                  <label
                    className={importedImageUrl ? "upload-zone has-image import-upload" : "upload-zone import-upload"}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, "import")}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => selectPhoto(event.target.files?.[0], "import")}
                    />
                    {importedImageUrl ? (
                      <span className="preview-frame">
                        <Image src={importedImageUrl} alt="보관할 이미지 미리보기" fill unoptimized sizes="(max-width: 900px) 88vw, 48vw" />
                        <span className="change-photo">다른 이미지 선택</span>
                      </span>
                    ) : (
                      <span className="upload-placeholder">
                        <span className="upload-symbol" aria-hidden="true">⌁</span>
                        <strong>이미지 고르기</strong>
                        <small>ChatGPT에서 받은 이미지도 좋아요</small>
                      </span>
                    )}
                  </label>
                  <button
                    className="button button-drive button-full"
                    type="button"
                    disabled={!importedImage || driveState === "connecting" || driveState === "saving"}
                    onClick={() =>
                      importedImage &&
                      saveToDrive(
                        importedImage,
                        safeFileName(importedImage.name.replace(/\.[^.]+$/, ""), fileExtension(importedImage)),
                      )
                    }
                  >
                    {driveState === "connecting" || driveState === "saving" ? "Google Drive 저장 중…" : "Google Drive에 저장"}
                  </button>
                  <Link className="button button-secondary button-full" href="/create">
                    새 풍경시 페이지 열기
                  </Link>
                </div>
              </div>
            )}

            {error ? <p className="feedback error" role="alert">{error}</p> : null}
            {driveMessage ? (
              <div className={`feedback ${driveState === "error" ? "error" : "success"}`} role="status" aria-live="polite">
                <span>{driveMessage}</span>
                {driveFileUrl ? <a href={driveFileUrl} target="_blank" rel="noreferrer">Drive에서 보기</a> : null}
              </div>
            ) : null}
            <div className="drive-location">
              <span>저장 위치</span>
              <a href={folderUrl} target="_blank" rel="noreferrer">지정한 Google Drive 폴더 ↗</a>
              <small>{config?.googleDrive.configured ? "Google 계정 연결 후 바로 저장" : "연결 정보가 없으면 다운로드 후 폴더가 열려요"}</small>
            </div>
          </div>
        </section>

        <section className="process-section" aria-labelledby="process-title">
          <div className="process-heading">
            <p className="eyebrow"><span aria-hidden="true">✦</span> 만드는 방식</p>
            <h2 id="process-title">풍경은 그대로,<br />느낌은 더 선명하게.</h2>
          </div>
          <ol className="process-list">
            <li><span>01</span><strong>풍경을 담고</strong><p>사진은 작품을 만드는 동안만 사용하고 별도로 보관하지 않아요.</p></li>
            <li><span>02</span><strong>마음을 적고</strong><p>한 단어의 감정도 충분해요. 당신의 문장을 시어로 다듬어요.</p></li>
            <li><span>03</span><strong>오래 간직해요</strong><p>완성 작품과 스케치를 내려받거나 Google Drive에 보관하세요.</p></li>
          </ol>
        </section>
      </main>

      <footer>
        <Link className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true">風</span><span><strong>풍경시</strong><small>VIEW · FEEL · VERSE</small></span></Link>
        <p>오늘 만난 장면을 내일의 문장으로.</p>
        <a href={folderUrl} target="_blank" rel="noreferrer">Google Drive 폴더 ↗</a>
      </footer>
    </>
  );
}
