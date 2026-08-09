import {
  ImageValidationError,
  validateUploadedImage,
  type ValidatedImage,
} from "@/lib/image-validation";
import {
  DEFAULT_OPENAI_TEXT_MODEL,
  getRuntimeEnv,
} from "@/lib/runtime-env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_FEELING_LENGTH = 2_000;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

type PoemDraft = {
  title: string;
  poem: string;
  note: string;
  keywords: string[];
};

type PoemResult = PoemDraft & {
  source: "openai" | "local";
};

type PoemLength = "short" | "medium" | "long";

type PoemRequest = {
  feeling: string;
  emotion: string;
  place: string;
  length: PoemLength;
  image?: File;
};

class RequestInputError extends Error {
  readonly status: 400 | 413 | 415;
  readonly code: string;

  constructor(message: string, status: 400 | 413 | 415, code: string) {
    super(message);
    this.name = "RequestInputError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formString(formData: FormData, ...keys: string[]): string {
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function formImage(formData: FormData): File | undefined {
  for (const key of ["image", "photo"]) {
    const value = formData.get(key);
    if (value && typeof value !== "string") return value;
  }
  return undefined;
}

function poemLength(value: unknown): PoemLength {
  return value === "short" || value === "medium" || value === "long"
    ? value
    : "medium";
}

async function parsePoemRequest(request: Request): Promise<PoemRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let feeling = "";
  let emotion = "";
  let place = "";
  let length: PoemLength = "medium";
  let image: File | undefined;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      feeling = formString(formData, "feeling", "note");
      emotion = formString(formData, "emotion");
      place = formString(formData, "place", "location");
      length = poemLength(formString(formData, "length"));
      image = formImage(formData);
    } else if (contentType.includes("application/json")) {
      const payload: unknown = await request.json();
      if (!isRecord(payload)) throw new Error("JSON body must be an object");
      feeling = optionalString(payload.feeling) || optionalString(payload.note);
      emotion = optionalString(payload.emotion);
      place = optionalString(payload.place) || optionalString(payload.location);
      length = poemLength(payload.length);
    } else {
      throw new RequestInputError(
        "JSON 또는 multipart/form-data 요청을 보내 주세요.",
        415,
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }
  } catch (error) {
    if (error instanceof RequestInputError) throw error;
    throw new RequestInputError(
      "요청 내용을 읽을 수 없습니다.",
      400,
      "INVALID_REQUEST_BODY",
    );
  }

  if (!feeling && !emotion) {
    throw new RequestInputError(
      "풍경에서 느낀 마음을 한 단어 이상 적어 주세요.",
      400,
      "FEELING_REQUIRED",
    );
  }

  if (feeling.length + emotion.length > MAX_FEELING_LENGTH) {
    throw new RequestInputError(
      "느낌은 2,000자 이내로 적어 주세요.",
      413,
      "FEELING_TOO_LONG",
    );
  }

  return { feeling: feeling || emotion, emotion, place, length, image };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function toDataUrl(image: ValidatedImage): Promise<string> {
  const bytes = new Uint8Array(await image.file.arrayBuffer());
  return `data:${image.mimeType};base64,${bytesToBase64(bytes)}`;
}

const POEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 40 },
    poem: { type: "string", minLength: 1, maxLength: 1_200 },
    note: { type: "string", minLength: 1, maxLength: 240 },
    keywords: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 20 },
    },
  },
  required: ["title", "poem", "note", "keywords"],
} as const;

function extractResponseText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;

  for (const output of payload.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function normalizePoemDraft(value: unknown): PoemDraft | null {
  if (!isRecord(value)) return null;

  const title = optionalString(value.title);
  const poem = optionalString(value.poem);
  const note = optionalString(value.note);
  const keywords = Array.isArray(value.keywords)
    ? value.keywords
        .filter((keyword): keyword is string => typeof keyword === "string")
        .map((keyword) => keyword.replace(/^#+/, "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (!title || !poem || !note || keywords.length < 3) return null;
  return { title, poem, note, keywords };
}

async function generatePoemWithOpenAI(
  request: PoemRequest,
  image: ValidatedImage | undefined,
  apiKey: string,
): Promise<PoemDraft> {
  const lineGuide = {
    short: "5~7행",
    medium: "8~10행",
    long: "11~14행",
  }[request.length];
  const userContent: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: [
        `느낌: ${request.feeling}`,
        request.emotion ? `감정 태그: ${request.emotion}` : "감정 태그: 없음",
        request.place ? `장소: ${request.place}` : "장소: 적지 않음",
        `원하는 길이: ${lineGuide}`,
        "사진이 있으면 사진 속 실제 빛, 날씨, 색, 거리감을 섬세하게 읽어 주세요.",
      ].join("\n"),
    },
  ];

  if (image) {
    userContent.push({
      type: "input_image",
      image_url: await toDataUrl(image),
      detail: "low",
    });
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        getRuntimeEnv("OPENAI_TEXT_MODEL") ?? DEFAULT_OPENAI_TEXT_MODEL,
      store: false,
      max_output_tokens: 1_200,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "당신은 한국어 현대시를 쓰는 시인입니다. 사용자가 본 풍경과 그 순간의 감정을 바탕으로 요청한 행 수에 맞는 시를 쓰세요. 상투적인 위로나 설명을 피하고, 사진에서 건져 올린 구체적인 감각과 여백을 살리세요. 제목과 시는 한국어로 쓰고, note에는 작품의 정서를 한 문장으로 담으세요. keywords는 짧은 한국어 명사 3~5개로 만드세요.",
            },
          ],
        },
        { role: "user", content: userContent },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "korean_landscape_poem",
          strict: true,
          schema: POEM_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Responses API returned ${response.status}`);
  }

  const payload: unknown = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI response did not contain output text");

  const poem = normalizePoemDraft(JSON.parse(text));
  if (!poem) throw new Error("OpenAI response did not match the poem schema");
  return poem;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function compactFeeling(feeling: string): string {
  const firstThought = feeling
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?。！？]+$/u, "");
  return firstThought.length > 52
    ? `${firstThought.slice(0, 51).trimEnd()}…`
    : firstThought;
}

export function createFallbackPoem(
  feeling: string,
  place = "",
  length: PoemLength = "medium",
  emotion = "",
): PoemDraft {
  const seed = hashText(`${feeling}\u241f${emotion}\u241f${place}\u241f${length}`);
  const titles = [
    "풍경이 마음을 지나는 동안",
    "빛이 머문 자리",
    "바람의 여백",
    "오늘을 닮은 먼 곳",
  ];
  const openings = [
    ["빛은 천천히 풍경의 어깨에 앉고", "바람은 지나온 길을 접어 둔다"],
    ["구름 한 장이 먼 능선을 넘을 때", "고요는 제 그림자를 길게 눕힌다"],
    ["나무들은 서로의 침묵을 흔들고", "햇살은 작은 틈마다 오래 머문다"],
    ["저녁은 사물의 모서리를 둥글게 하고", "멀어진 길 위로 온기가 번진다"],
  ];
  const closings = [
    ["나는 이 풍경을 지나왔지만", "풍경은 아직 내 안을 걷고 있다"],
    ["사라지는 것들은 멀어지는 대신", "마음속에서 조금 더 환해진다"],
    ["돌아서는 발끝에 남은 한 줌의 빛", "오늘은 그것으로 충분히 깊다"],
    ["말하지 못한 마음의 가장자리에서", "작은 바람 하나가 오래 빛난다"],
  ];

  const opening = openings[seed % openings.length];
  const closing = closings[Math.floor(seed / 7) % closings.length];
  const rememberedFeeling = compactFeeling(feeling);
  const placeLine = place
    ? `${compactFeeling(place)}의 공기는 천천히 이름을 얻고`
    : "이름 모를 곳의 공기는 천천히 결을 얻고";

  const mediumLines = [
    ...opening,
    "",
    placeLine,
    `‘${rememberedFeeling}’`,
    "말이 되기 전의 마음이",
    "한 줄의 먼 능선처럼 남는다",
    "",
    ...closing,
  ];
  const poemLines =
    length === "short"
      ? [
          opening[0],
          opening[1],
          `‘${rememberedFeeling}’`,
          "말이 되기 전의 마음이",
          "한 줄의 먼 능선처럼 남는다",
          closing[0],
          closing[1],
        ]
      : length === "long"
        ? [
            ...opening,
            "",
            placeLine,
            `‘${rememberedFeeling}’`,
            emotion ? `${compactFeeling(emotion)}라는 작은 파문이 번지고` : "작은 파문 하나가 고요를 건너고",
            "말이 되기 전의 마음이",
            "한 줄의 먼 능선처럼 남는다",
            "보이지 않던 하루의 결마다",
            "늦은 빛이 조용히 스며든다",
            "",
            ...closing,
          ]
        : mediumLines;

  return {
    title: titles[Math.floor(seed / 13) % titles.length],
    poem: poemLines.join("\n"),
    note:
      "눈앞의 풍경과 마음속 풍경이 서로를 비추는 순간을 담았습니다.",
    keywords: ["풍경", "마음", "빛", "여백"],
  };
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof ImageValidationError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  if (error instanceof RequestInputError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  return null;
}

function poemResponse(poem: PoemResult): Response {
  return Response.json(poem, {
    headers: {
      ...NO_STORE_HEADERS,
      "X-Poem-Source": poem.source,
    },
  });
}

export async function POST(request: Request) {
  try {
    const poemRequest = await parsePoemRequest(request);
    const image = poemRequest.image
      ? await validateUploadedImage(poemRequest.image)
      : undefined;
    const fallback = createFallbackPoem(
      poemRequest.feeling,
      poemRequest.place,
      poemRequest.length,
      poemRequest.emotion,
    );
    const apiKey = getRuntimeEnv("OPENAI_API_KEY");

    if (!apiKey) return poemResponse({ ...fallback, source: "local" });

    try {
      const poem = await generatePoemWithOpenAI(
        poemRequest,
        image,
        apiKey,
      );
      return poemResponse({ ...poem, source: "openai" });
    } catch (error) {
      console.warn(
        "OpenAI poem generation failed; using the deterministic fallback.",
        error instanceof Error ? error.message : "Unknown error",
      );
      return poemResponse({ ...fallback, source: "local" });
    }
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;

    return Response.json(
      { error: "시를 만드는 요청을 처리하지 못했습니다.", code: "POEM_ERROR" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
