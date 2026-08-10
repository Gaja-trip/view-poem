import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function renderPath(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function renderHtml(pathname) {
  const response = await renderPath(pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

function assertNoStarterPreview(html) {
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(
    html,
    /Building your site|Your site is taking shape|sites-skeleton|SkeletonPreview/i,
  );
  assert.doesNotMatch(html, /react-loading-skeleton/i);
}

test("server-renders the Korean product home with links to both workflows", async () => {
  const html = await renderHtml("/");
  assert.match(html, /<html[^>]*\blang=["']ko["'][^>]*>/i);
  assert.match(
    html,
    /<title>풍경시(?:<!-- -->)? — 산책자의 작은 시집<\/title>/i,
  );
  assert.match(html, /산책자의 작은 시집/);
  assert.match(html, /두 개의 기록 방식/);
  assert.match(html, /풍경을 시로/);
  assert.match(html, /이미지를 보관함에/);
  assert.match(
    html,
    /<a\b[^>]*\bhref=["']\/create["'][^>]*>[\s\S]*?새 풍경시 만들기[\s\S]*?<\/a>/i,
  );
  assert.match(
    html,
    /<a\b[^>]*\bhref=["']\/archive["'][^>]*>[\s\S]*?ChatGPT 이미지 보관하기[\s\S]*?<\/a>/i,
  );
  assert.match(html, /ChatGPT 이미지를 Google Drive에 오래 간직해요\./);
  assertNoStarterPreview(html);
});

test("server-renders only the poem creation workflow at /create", async () => {
  const html = await renderHtml("/create");
  assert.match(html, /사진 찍기 또는 선택하기/);
  assert.match(html, /3단계 중 1단계 풍경/);
  assert.match(html, /이 풍경으로 계속하기/);
  assert.doesNotMatch(html, /ChatGPT에서 내려받은 이미지를 선택하면/);
  assert.doesNotMatch(html, /KEEP AN IMAGE/);
  assertNoStarterPreview(html);
});

test("server-renders only the image archive workflow at /archive", async () => {
  const html = await renderHtml("/archive");
  assert.match(html, /ChatGPT에서 내려받은 이미지를 선택하면/);
  assert.match(html, /이미지 고르기/);
  assert.match(html, /Google Drive에 저장/);
  assert.doesNotMatch(html, /사진 찍기 또는 선택하기/);
  assert.doesNotMatch(html, /3단계 중 1단계 풍경/);
  assertNoStarterPreview(html);
});

test("keeps starter preview code out and includes the product integration files", async () => {
  const [pageSource, layoutSource, packageSource] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.doesNotMatch(pageSource, /_sites-preview|codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layoutSource, /_sites-preview|codex-preview|SkeletonPreview/);
  assert.equal(packageJson.dependencies?.["react-loading-skeleton"], undefined);
  assert.equal(packageJson.devDependencies?.["react-loading-skeleton"], undefined);

  await Promise.all([
    assert.rejects(access(new URL("app/_sites-preview", projectRoot))),
    assert.rejects(access(new URL("public/_sites-preview", projectRoot))),
    access(new URL("app/api/config/route.ts", projectRoot)),
    access(new URL("app/api/poem/route.ts", projectRoot)),
    access(new URL("app/api/sketch/route.ts", projectRoot)),
    access(new URL(".env.example", projectRoot)),
  ]);
});

test("keeps the Vercel Next.js deployment contract", async () => {
  const [packageSource, vercelSource] = await Promise.all([
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("vercel.json", projectRoot), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const vercelJson = JSON.parse(vercelSource);

  assert.match(packageJson.dependencies?.next ?? "", /\S/);
  assert.equal(packageJson.scripts?.["build:vercel"], "next build");
  assert.equal(vercelJson.framework, "nextjs");
  assert.equal(vercelJson.buildCommand, "npm run build:vercel");
});
